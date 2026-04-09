"""Helpers for sandbox browser proxy URL validation and response rewriting."""

from __future__ import annotations

import ipaddress
import json
import re
from http.cookies import SimpleCookie
from urllib.parse import SplitResult, urlsplit, urlunsplit

PASSTHROUGH_SCHEMES = ("about:", "blob:", "data:", "javascript:", "mailto:", "tel:")

_ATTR_RE = re.compile(
    r'(?P<prefix>\b(?:action|href|poster|src)\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)',
    flags=re.IGNORECASE | re.DOTALL,
)
_BASE_RE = re.compile(
    r"(?P<tag><base\b[^>]*href\s*=\s*)(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    flags=re.IGNORECASE | re.DOTALL,
)
_HEAD_RE = re.compile(r"<head\b[^>]*>", flags=re.IGNORECASE)
_SRCSET_RE = re.compile(
    r'(?P<prefix>\bsrcset\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)',
    flags=re.IGNORECASE | re.DOTALL,
)
_CSS_URL_RE = re.compile(
    r"url\(\s*(?P<quote>['\"]?)(?P<value>.*?)(?P=quote)\s*\)",
    flags=re.IGNORECASE | re.DOTALL,
)
_CSS_IMPORT_RE = re.compile(
    r"@import\s+(?P<quote>['\"])(?P<value>.*?)(?P=quote)",
    flags=re.IGNORECASE | re.DOTALL,
)


def is_local_sandbox_host(hostname: str | None) -> bool:
    """Return True when *hostname* should resolve inside the sandbox."""
    if not hostname:
        return False

    lowered = hostname.strip().lower()
    if lowered in {"localhost", "0.0.0.0"}:
        return True

    try:
        ip = ipaddress.ip_address(lowered)
    except ValueError:
        return False

    return ip.is_loopback or ip == ipaddress.ip_address("0.0.0.0")


def default_port_for_scheme(scheme: str) -> int:
    return 443 if scheme.lower() == "https" else 80


def build_target_url(
    *,
    scheme: str,
    host_port: str,
    path: str = "",
    query: str = "",
) -> str:
    normalized_path = "/" + path.lstrip("/") if path else "/"
    return urlunsplit((scheme, host_port, normalized_path, query, ""))


def build_proxy_root_path(session_id: str, scheme: str, host_port: str) -> str:
    return f"/api/v1/sessions/{session_id}/sandbox/browser/{scheme}/{host_port}/"


def build_current_proxy_path(proxy_root_path: str, path: str, request_path: str) -> str:
    if not path:
        return proxy_root_path

    current = proxy_root_path + path.lstrip("/")
    if request_path.endswith("/") and not current.endswith("/"):
        return current + "/"
    return current


def build_document_proxy_base(current_proxy_path: str) -> str:
    if current_proxy_path.endswith("/"):
        return current_proxy_path
    if "/" not in current_proxy_path:
        return current_proxy_path + "/"
    return current_proxy_path.rsplit("/", 1)[0] + "/"


def rewrite_browser_location(
    raw_url: str,
    *,
    target_url: str,
    proxy_root_path: str,
) -> str:
    raw = raw_url.strip()
    if not raw:
        return raw_url
    if raw.startswith(PASSTHROUGH_SCHEMES) or raw.startswith("#"):
        return raw_url

    target_parts = urlsplit(target_url)
    candidate = raw
    if raw.startswith("//"):
        candidate = f"{target_parts.scheme}:{raw}"

    if raw.startswith("/"):
        return _proxy_join(proxy_root_path, raw)

    candidate_parts = urlsplit(candidate)
    if candidate_parts.scheme not in {"http", "https"}:
        return raw_url

    if _origin_key(candidate_parts) != _origin_key(target_parts):
        return raw_url

    proxied = _proxy_join(proxy_root_path, candidate_parts.path or "/")
    if candidate_parts.query:
        proxied = f"{proxied}?{candidate_parts.query}"
    if candidate_parts.fragment:
        proxied = f"{proxied}#{candidate_parts.fragment}"
    return proxied


def rewrite_html_document(
    html: str,
    *,
    target_url: str,
    proxy_root_path: str,
    current_proxy_path: str,
) -> str:
    document_proxy_base = build_document_proxy_base(current_proxy_path)

    rewritten = _ATTR_RE.sub(
        lambda match: (
            f"{match.group('prefix')}{match.group('quote')}"
            f"{rewrite_browser_location(match.group('value'), target_url=target_url, proxy_root_path=proxy_root_path)}"
            f"{match.group('quote')}"
        ),
        html,
    )

    rewritten = _SRCSET_RE.sub(
        lambda match: (
            f"{match.group('prefix')}{match.group('quote')}"
            f"{_rewrite_srcset(match.group('value'), target_url=target_url, proxy_root_path=proxy_root_path)}"
            f"{match.group('quote')}"
        ),
        rewritten,
    )

    rewritten = _rewrite_or_inject_base_tag(
        rewritten,
        document_proxy_base=document_proxy_base,
    )

    return _inject_runtime_script(
        rewritten,
        target_url=target_url,
        proxy_root_path=proxy_root_path,
    )


def rewrite_css_stylesheet(
    css: str,
    *,
    target_url: str,
    proxy_root_path: str,
) -> str:
    rewritten = _CSS_URL_RE.sub(
        lambda match: (
            f"url({match.group('quote')}"
            f"{rewrite_browser_location(match.group('value'), target_url=target_url, proxy_root_path=proxy_root_path)}"
            f"{match.group('quote')})"
        ),
        css,
    )

    rewritten = _CSS_IMPORT_RE.sub(
        lambda match: (
            f"@import {match.group('quote')}"
            f"{rewrite_browser_location(match.group('value'), target_url=target_url, proxy_root_path=proxy_root_path)}"
            f"{match.group('quote')}"
        ),
        rewritten,
    )
    return rewritten


def rewrite_set_cookie_header(raw_header: str, *, proxy_path: str) -> list[str]:
    cookie = SimpleCookie()
    try:
        cookie.load(raw_header)
    except Exception:
        return []

    rewritten: list[str] = []
    for morsel in cookie.values():
        morsel["path"] = proxy_path
        if morsel["domain"]:
            morsel["domain"] = ""
        rewritten.append(morsel.OutputString())

    return rewritten


def _origin_key(parts: SplitResult) -> tuple[str, str, int]:
    hostname = (parts.hostname or "").lower()
    return (
        parts.scheme.lower(),
        hostname,
        parts.port or default_port_for_scheme(parts.scheme),
    )


def _proxy_join(proxy_root_path: str, raw_path: str) -> str:
    root = proxy_root_path.rstrip("/") + "/"
    suffix = raw_path.lstrip("/")
    return root if not suffix else root + suffix


def _rewrite_srcset(value: str, *, target_url: str, proxy_root_path: str) -> str:
    rewritten_parts: list[str] = []
    for candidate in value.split(","):
        item = candidate.strip()
        if not item:
            continue
        url_part, sep, descriptor = item.partition(" ")
        rewritten_url = rewrite_browser_location(
            url_part,
            target_url=target_url,
            proxy_root_path=proxy_root_path,
        )
        rewritten_parts.append(
            f"{rewritten_url}{sep}{descriptor}".strip()
        )
    return ", ".join(rewritten_parts)


def _rewrite_or_inject_base_tag(document: str, *, document_proxy_base: str) -> str:
    replacement = (
        r"\g<tag>"
        + '"'
        + document_proxy_base
        + '"'
    )
    if _BASE_RE.search(document):
        return _BASE_RE.sub(replacement, document, count=1)

    base_tag = f'<base href="{document_proxy_base}">'
    head_match = _HEAD_RE.search(document)
    if head_match:
        idx = head_match.end()
        return document[:idx] + base_tag + document[idx:]
    return base_tag + document


def _inject_runtime_script(
    document: str,
    *,
    target_url: str,
    proxy_root_path: str,
) -> str:
    target_parts = urlsplit(target_url)
    config = json.dumps(
        {
            "proxyRootPath": proxy_root_path.rstrip("/") + "/",
            "targetOrigin": f"{target_parts.scheme}://{target_parts.netloc}",
        },
        separators=(",", ":"),
    )
    script = (
        "<script>"
        "(function(){"
        f"const __cfg={config};"
        "const __skip=/^(about:|blob:|data:|javascript:|mailto:|tel:)/i;"
        "function __toProxy(raw, base){"
        "if(raw==null||raw===''){return raw;}"
        "const value=String(raw);"
        "if(__skip.test(value)||value.startsWith('#')){return raw;}"
        "if(value.startsWith(__cfg.proxyRootPath)){return raw;}"
        "let url;"
        "try{url=new URL(value, base||window.location.href);}catch{return raw;}"
        "if(!/^https?:$/.test(url.protocol)){return raw;}"
        "if(url.origin===__cfg.targetOrigin){"
        "return __cfg.proxyRootPath+url.pathname.replace(/^\\//,'')+url.search+url.hash;"
        "}"
        "return raw;"
        "}"
        "const __fetch=window.fetch&&window.fetch.bind(window);"
        "if(__fetch){window.fetch=function(input, init){"
        "if(typeof input==='string'){return __fetch(__toProxy(input), init);}"
        "if(input instanceof URL){return __fetch(__toProxy(input.toString()), init);}"
        "if(input instanceof Request){return __fetch(new Request(__toProxy(input.url), input), init);}"
        "return __fetch(input, init);"
        "};}"
        "const __xhrOpen=XMLHttpRequest.prototype.open;"
        "XMLHttpRequest.prototype.open=function(method, url){"
        "const rest=[].slice.call(arguments,2);"
        "return __xhrOpen.call(this, method, __toProxy(url), ...rest);"
        "};"
        "const __open=window.open&&window.open.bind(window);"
        "if(__open){window.open=function(url, target, features){"
        "return __open(url?__toProxy(url):url, target, features);"
        "};}"
        "const __pushState=history.pushState.bind(history);"
        "history.pushState=function(state, unused, url){"
        "return __pushState(state, unused, url==null?url:__toProxy(url));"
        "};"
        "const __replaceState=history.replaceState.bind(history);"
        "history.replaceState=function(state, unused, url){"
        "return __replaceState(state, unused, url==null?url:__toProxy(url));"
        "};"
        "const __setAttr=Element.prototype.setAttribute;"
        "Element.prototype.setAttribute=function(name, value){"
        "const lowered=String(name).toLowerCase();"
        "if(['src','href','action','poster'].includes(lowered)&&typeof value==='string'){"
        "value=__toProxy(value, document.baseURI);"
        "}"
        "return __setAttr.call(this, name, value);"
        "};"
        "document.addEventListener('click', function(event){"
        "const target=event.target&&event.target.closest?event.target.closest('a[href]'):null;"
        "if(!target){return;}"
        "const href=target.getAttribute('href');"
        "const proxied=__toProxy(href, document.baseURI);"
        "if(proxied!==href){target.setAttribute('href', proxied);}"
        "}, true);"
        "})();"
        "</script>"
    )

    head_match = _HEAD_RE.search(document)
    if head_match:
        idx = head_match.end()
        return document[:idx] + script + document[idx:]
    return script + document
