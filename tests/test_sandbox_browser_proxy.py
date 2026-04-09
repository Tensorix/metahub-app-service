from uuid import uuid4

import httpx

from app.router.v1.sandbox import _build_browser_proxy_response
from app.sandbox.browser_proxy import (
    build_current_proxy_path,
    build_proxy_root_path,
    build_target_url,
    is_local_sandbox_host,
    rewrite_browser_location,
    rewrite_css_stylesheet,
    rewrite_html_document,
    rewrite_set_cookie_header,
)


def test_is_local_sandbox_host_matches_loopback_variants():
    assert is_local_sandbox_host("localhost")
    assert is_local_sandbox_host("127.0.0.1")
    assert is_local_sandbox_host("0.0.0.0")
    assert is_local_sandbox_host("::1")
    assert not is_local_sandbox_host("example.com")


def test_rewrite_browser_location_rewrites_same_origin_and_root_relative_urls():
    target_url = "http://localhost:3000/dashboard"
    proxy_root = "/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/"

    assert (
        rewrite_browser_location(
            "/assets/app.js",
            target_url=target_url,
            proxy_root_path=proxy_root,
        )
        == "/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/assets/app.js"
    )
    assert (
        rewrite_browser_location(
            "http://localhost:3000/api/me?x=1",
            target_url=target_url,
            proxy_root_path=proxy_root,
        )
        == "/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/api/me?x=1"
    )
    assert (
        rewrite_browser_location(
            "https://example.com/app.js",
            target_url=target_url,
            proxy_root_path=proxy_root,
        )
        == "https://example.com/app.js"
    )


def test_rewrite_html_document_injects_proxy_runtime_and_rewrites_assets():
    html = """
    <html>
      <head><title>App</title></head>
      <body>
        <script src="/main.js"></script>
        <img src="http://localhost:3000/logo.png">
        <a href="/settings">settings</a>
      </body>
    </html>
    """
    rewritten = rewrite_html_document(
        html,
        target_url="http://localhost:3000/app/index.html",
        proxy_root_path="/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/",
        current_proxy_path="/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/app/index.html",
    )

    assert '<base href="/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/app/">' in rewritten
    assert '/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/main.js' in rewritten
    assert '/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/logo.png' in rewritten
    assert 'const __cfg=' in rewritten


def test_rewrite_css_stylesheet_rewrites_root_relative_assets():
    css = """
    body { background-image: url('/assets/bg.png'); }
    @import "/assets/theme.css";
    """
    rewritten = rewrite_css_stylesheet(
        css,
        target_url="http://localhost:3000/",
        proxy_root_path="/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/",
    )

    assert "/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/assets/bg.png" in rewritten
    assert "/api/v1/sessions/abc/sandbox/browser/http/localhost:3000/assets/theme.css" in rewritten


def test_rewrite_set_cookie_header_scopes_cookie_to_proxy_path():
    cookies = rewrite_set_cookie_header(
        "session=abc; Path=/; HttpOnly; SameSite=Lax",
        proxy_path="/api/v1/sessions/abc/sandbox/browser",
    )

    assert cookies == [
        "session=abc; HttpOnly; Path=/api/v1/sessions/abc/sandbox/browser; SameSite=Lax"
    ]


def test_build_browser_proxy_response_rewrites_location_and_set_cookie():
    session_id = uuid4()
    proxy_root = build_proxy_root_path(str(session_id), "http", "localhost:3000")
    current_proxy = build_current_proxy_path(proxy_root, "", proxy_root.rstrip("/"))
    target_url = build_target_url(
        scheme="http",
        host_port="localhost:3000",
        path="",
        query="",
    )
    request = httpx.Request("GET", "https://sandbox.example.com/")
    upstream = httpx.Response(
        302,
        request=request,
        headers=[
            ("content-type", "text/html; charset=utf-8"),
            ("location", "/login"),
            ("set-cookie", "session=abc; Path=/; HttpOnly"),
        ],
        content=b"<html><head></head><body>redirect</body></html>",
    )

    response = _build_browser_proxy_response(
        upstream,
        target_url=target_url,
        proxy_root_path=proxy_root,
        current_proxy_path=current_proxy,
        proxy_cookie_path=f"/api/v1/sessions/{session_id}/sandbox/browser",
    )

    assert response.headers["location"] == f"{proxy_root}login"
    set_cookie_headers = [value.decode("latin-1") for name, value in response.raw_headers if name == b"set-cookie"]
    assert set_cookie_headers == [
        f"session=abc; HttpOnly; Path=/api/v1/sessions/{session_id}/sandbox/browser"
    ]
