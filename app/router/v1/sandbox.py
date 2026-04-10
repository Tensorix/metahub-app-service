"""API endpoints for per-session sandbox lifecycle and filesystem access."""

from __future__ import annotations

import contextlib
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from jose import jwt
from sqlalchemy.orm import Session

from app.config import config
from app.db.model import Session as SessionModel
from app.db.model.session_sandbox import SessionSandbox
from app.db.session import get_db
from app.deps import get_current_user
from app.db.model.user import User
from app.sandbox.browser_proxy import (
    build_current_proxy_path,
    build_proxy_root_path,
    build_target_url,
    default_port_for_scheme,
    is_local_sandbox_host,
    rewrite_browser_location,
    rewrite_css_stylesheet,
    rewrite_html_document,
    rewrite_set_cookie_header,
)
from app.schema.sandbox import (
    SandboxAdminInfo,
    SandboxAdminListResponse,
    SandboxAdminPagination,
    SandboxConfigUpdateRequest,
    SandboxCreateRequest,
    SandboxFileListResponse,
    SandboxFileReadResponse,
    SandboxFileWriteRequest,
    SandboxFileWriteResponse,
    SandboxRenewRequest,
    SandboxResponse,
    SandboxTransferRequest,
    SandboxTransferResponse,
)
from app.service.sandbox import SandboxService

logger = logging.getLogger(__name__)

router = APIRouter()

_BROWSER_PROXY_COOKIE = "metahub_sandbox_browser"
_BROWSER_PROXY_TOKEN_TYPE = "sandbox_browser"
_BROWSER_PROXY_TTL_SECONDS = 600
_HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}
_PROXY_STRIPPED_RESPONSE_HEADERS = _HOP_BY_HOP_HEADERS | {
    "access-control-allow-credentials",
    "access-control-allow-origin",
    "content-encoding",
    "content-length",
    "content-security-policy",
    "content-security-policy-report-only",
    "cross-origin-embedder-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "etag",
    "location",
    "set-cookie",
    "x-frame-options",
}


def _validate_session_owner(db: Session, session_id: UUID, user_id: UUID) -> SessionModel:
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == user_id,
        SessionModel.is_deleted == False,  # noqa: E712
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return session


# ---------------------------------------------------------------------------
# Sandbox lifecycle
# ---------------------------------------------------------------------------


@router.post(
    "/sessions/{session_id}/sandbox",
    response_model=SandboxResponse,
)
async def create_sandbox(
    session_id: UUID,
    body: SandboxCreateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    body = body or SandboxCreateRequest()
    record = await SandboxService.create_sandbox(
        db,
        session_id=session_id,
        user_id=current_user.id,
        image=body.image,
        timeout=body.timeout,
        timeout_provided="timeout" in body.model_fields_set,
        env=body.env,
        mounts=body.mounts,
    )
    return record


@router.get(
    "/sessions/{session_id}/sandbox",
    response_model=SandboxResponse | None,
)
async def get_sandbox(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    record = await SandboxService.get_sandbox(db, session_id, current_user.id)
    if not record:
        return None
    return record


@router.put(
    "/sessions/{session_id}/sandbox/config",
    response_model=SandboxResponse,
)
async def update_sandbox_config(
    session_id: UUID,
    body: SandboxConfigUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist per-session sandbox config without starting a sandbox."""
    _validate_session_owner(db, session_id, current_user.id)
    record = await SandboxService.upsert_sandbox_config(
        db,
        session_id=session_id,
        user_id=current_user.id,
        image=body.image,
        timeout=body.timeout,
        timeout_provided="timeout" in body.model_fields_set,
        env=body.env,
        replace_env="env" in body.model_fields_set,
        mounts=body.mounts,
        replace_mounts="mounts" in body.model_fields_set,
    )
    return record


@router.delete(
    "/sessions/{session_id}/sandbox",
    response_model=SandboxResponse,
)
async def stop_sandbox(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    record = await SandboxService.stop_sandbox(db, session_id, current_user.id)
    return record


@router.post(
    "/sessions/{session_id}/sandbox/pause",
    response_model=SandboxResponse,
)
async def pause_sandbox(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    record = await SandboxService.pause_sandbox(db, session_id, current_user.id)
    return record


@router.post(
    "/sessions/{session_id}/sandbox/resume",
    response_model=SandboxResponse,
)
async def resume_sandbox(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    record = await SandboxService.resume_sandbox(db, session_id, current_user.id)
    return record


@router.post(
    "/sessions/{session_id}/sandbox/renew",
    response_model=SandboxResponse,
)
async def renew_sandbox(
    session_id: UUID,
    body: SandboxRenewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    record = await SandboxService.renew_sandbox(
        db, session_id, current_user.id, body.duration
    )
    return record


# ---------------------------------------------------------------------------
# Sandbox browser
# ---------------------------------------------------------------------------


@router.post("/sessions/{session_id}/sandbox/browser/session")
async def create_sandbox_browser_session(
    session_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    _require_running_sandbox(db, session_id)

    token = _create_browser_proxy_token(current_user.id, session_id)
    response = JSONResponse({"success": True})
    response.set_cookie(
        key=_BROWSER_PROXY_COOKIE,
        value=token,
        httponly=True,
        max_age=_BROWSER_PROXY_TTL_SECONDS,
        samesite="lax",
        secure=request.url.scheme == "https",
        path=_browser_proxy_cookie_path(session_id),
    )
    return response


@router.api_route(
    "/sessions/{session_id}/sandbox/browser/{scheme}/{host_port}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
@router.api_route(
    "/sessions/{session_id}/sandbox/browser/{scheme}/{host_port}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def sandbox_browser_proxy(
    session_id: UUID,
    scheme: str,
    host_port: str,
    request: Request,
    path: str = "",
    db: Session = Depends(get_db),
):
    user_id = _authenticate_browser_proxy_request(request, session_id)
    _validate_session_owner(db, session_id, user_id)

    record = _get_running_sandbox_record(db, session_id)
    if not record or not record.sandbox_id:
        raise HTTPException(404, "No running sandbox for this session")

    normalized_scheme = scheme.lower()
    if normalized_scheme not in {"http", "https"}:
        raise HTTPException(400, "Sandbox browser proxy only supports http(s) URLs")

    target_url = build_target_url(
        scheme=normalized_scheme,
        host_port=host_port,
        path=path,
        query=request.url.query,
    )

    target = httpx.URL(target_url)
    if not is_local_sandbox_host(target.host):
        raise HTTPException(
            400,
            "Sandbox browser proxy currently supports only localhost-style targets",
        )

    from app.sandbox import get_sandbox_client
    from app.service.system_config import get_sandbox_config

    client = get_sandbox_client(get_sandbox_config(db))
    endpoint = await client.get_endpoint(
        record.sandbox_id,
        target.port or default_port_for_scheme(normalized_scheme),
    )

    body = await request.body()
    upstream_response = await client.request_endpoint(
        endpoint,
        request.method,
        target.path or "/",
        params=list(request.query_params.multi_items()),
        headers=_build_browser_upstream_headers(request, target_url),
        content=body or None,
    )

    try:
        proxy_root_path = build_proxy_root_path(str(session_id), normalized_scheme, host_port)
        current_proxy_path = build_current_proxy_path(
            proxy_root_path,
            path,
            request.url.path,
        )
        return _build_browser_proxy_response(
            upstream_response,
            target_url=target_url,
            proxy_root_path=proxy_root_path,
            current_proxy_path=current_proxy_path,
            proxy_cookie_path=_browser_proxy_cookie_path(session_id),
        )
    finally:
        await upstream_response.aclose()


# ---------------------------------------------------------------------------
# Sandbox filesystem
# ---------------------------------------------------------------------------


@router.get(
    "/sessions/{session_id}/sandbox/files",
    response_model=SandboxFileListResponse,
)
async def list_sandbox_files(
    session_id: UUID,
    path: str = Query("/", description="Directory to list"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    sandbox_id = _require_running_sandbox(db, session_id)
    from app.service.system_config import get_sandbox_config
    from app.sandbox import get_sandbox_client

    client = get_sandbox_client(get_sandbox_config(db))
    files = await client.list_files(sandbox_id, path)
    return SandboxFileListResponse(files=files)


@router.get(
    "/sessions/{session_id}/sandbox/files/read",
    response_model=SandboxFileReadResponse,
)
async def read_sandbox_file(
    session_id: UUID,
    path: str = Query(..., description="File path to read"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    sandbox_id = _require_running_sandbox(db, session_id)
    from app.service.system_config import get_sandbox_config
    from app.sandbox import get_sandbox_client

    client = get_sandbox_client(get_sandbox_config(db))
    content = await client.read_file(sandbox_id, path)
    return SandboxFileReadResponse(path=path, content=content)


@router.post(
    "/sessions/{session_id}/sandbox/files/write",
    response_model=SandboxFileWriteResponse,
)
async def write_sandbox_file(
    session_id: UUID,
    body: SandboxFileWriteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    sandbox_id = _require_running_sandbox(db, session_id)
    from app.service.system_config import get_sandbox_config
    from app.sandbox import get_sandbox_client

    client = get_sandbox_client(get_sandbox_config(db))
    await client.write_file(sandbox_id, body.path, body.content)
    return SandboxFileWriteResponse(path=body.path)


@router.delete(
    "/sessions/{session_id}/sandbox/files",
)
async def delete_sandbox_file(
    session_id: UUID,
    path: str = Query(..., description="File path to delete"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_session_owner(db, session_id, current_user.id)
    sandbox_id = _require_running_sandbox(db, session_id)
    from app.service.system_config import get_sandbox_config
    from app.sandbox import get_sandbox_client

    client = get_sandbox_client(get_sandbox_config(db))
    await client.delete_file(sandbox_id, path)
    return {"success": True}


# ---------------------------------------------------------------------------
# File transfer between store and sandbox
# ---------------------------------------------------------------------------


@router.post(
    "/sessions/{session_id}/sandbox/files/transfer",
    response_model=SandboxTransferResponse,
)
async def transfer_file(
    session_id: UUID,
    body: SandboxTransferRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transfer a file between the agent store and the sandbox."""
    _validate_session_owner(db, session_id, current_user.id)
    sandbox_id = _require_running_sandbox(db, session_id)

    from app.agent.factory import AgentFactory
    from app.sandbox import get_sandbox_client
    from app.service.system_config import get_sandbox_config

    store = await AgentFactory.get_store()
    client = get_sandbox_client(get_sandbox_config(db))
    dest_path = body.dest_path or body.path

    if body.source == body.destination:
        raise HTTPException(400, "Source and destination must differ")

    if body.source == "store":
        # Read from store → write to sandbox
        namespace = (str(session_id), "filesystem")
        # Strip /workspace/ prefix for store lookup
        store_key = body.path
        if store_key.startswith("/workspace/"):
            store_key = store_key[len("/workspace/"):]
        elif store_key.startswith("/workspace"):
            store_key = store_key[len("/workspace"):]

        item = await store.aget(namespace, store_key)
        if not item or not item.value:
            raise HTTPException(404, f"Store file not found: {body.path}")

        content = item.value.get("content", "")
        await client.write_file(sandbox_id, dest_path, content)

    else:
        # Read from sandbox → write to store
        content = await client.read_file(sandbox_id, body.path)
        namespace = (str(session_id), "filesystem")
        store_key = dest_path
        if store_key.startswith("/workspace/"):
            store_key = store_key[len("/workspace/"):]
        elif store_key.startswith("/workspace"):
            store_key = store_key[len("/workspace"):]

        from deepagents.backends.utils import create_file_data
        file_data = create_file_data(content)
        await store.aput(namespace, store_key, file_data)

    return SandboxTransferResponse(
        source=body.source,
        destination=body.destination,
        path=body.path,
        dest_path=dest_path,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _browser_proxy_cookie_path(session_id: UUID) -> str:
    return f"/api/v1/sessions/{session_id}/sandbox/browser"


def _create_browser_proxy_token(user_id: UUID, session_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "type": _BROWSER_PROXY_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(seconds=_BROWSER_PROXY_TTL_SECONDS),
    }
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def _authenticate_browser_proxy_request(request: Request, session_id: UUID) -> UUID:
    token = request.cookies.get(_BROWSER_PROXY_COOKIE)
    if not token:
        raise HTTPException(401, "Missing sandbox browser session")

    from app.service.auth import TokenService

    payload = TokenService.decode_token(token)
    if not payload or payload.get("type") != _BROWSER_PROXY_TOKEN_TYPE:
        raise HTTPException(401, "Invalid sandbox browser session")
    if payload.get("sid") != str(session_id):
        raise HTTPException(401, "Sandbox browser session does not match this session")

    try:
        return UUID(str(payload.get("sub")))
    except (TypeError, ValueError) as exc:
        raise HTTPException(401, "Invalid sandbox browser session user") from exc


def _build_browser_upstream_headers(request: Request, target_url: str) -> dict[str, str]:
    target = httpx.URL(target_url)
    target_origin = f"{target.scheme}://{target.netloc}"
    headers: dict[str, str] = {}

    for name, value in request.headers.items():
        lowered = name.lower()
        if lowered in _HOP_BY_HOP_HEADERS or lowered in {"host", "origin", "referer"}:
            continue
        if lowered == "accept-encoding":
            continue
        headers[name] = value

    headers["Host"] = target.netloc
    headers["Accept-Encoding"] = "identity"

    if request.headers.get("origin"):
        headers["Origin"] = target_origin
    if request.headers.get("referer"):
        headers["Referer"] = target_url

    return headers


def _build_browser_proxy_response(
    upstream_response: httpx.Response,
    *,
    target_url: str,
    proxy_root_path: str,
    current_proxy_path: str,
    proxy_cookie_path: str,
) -> Response:
    content_type = upstream_response.headers.get("content-type", "")
    lowered_content_type = content_type.lower()
    body = upstream_response.content

    if lowered_content_type.startswith("text/html") or lowered_content_type.startswith("application/xhtml+xml"):
        document = upstream_response.text
        body = rewrite_html_document(
            document,
            target_url=target_url,
            proxy_root_path=proxy_root_path,
            current_proxy_path=current_proxy_path,
        ).encode(upstream_response.encoding or "utf-8")
    elif lowered_content_type.startswith("text/css"):
        stylesheet = upstream_response.text
        body = rewrite_css_stylesheet(
            stylesheet,
            target_url=target_url,
            proxy_root_path=proxy_root_path,
        ).encode(upstream_response.encoding or "utf-8")

    response = Response(content=body, status_code=upstream_response.status_code)

    for name, value in upstream_response.headers.items():
        lowered = name.lower()
        if lowered in _PROXY_STRIPPED_RESPONSE_HEADERS:
            continue
        response.headers[name] = value

    location = upstream_response.headers.get("location")
    if location:
        response.headers["Location"] = rewrite_browser_location(
            location,
            target_url=target_url,
            proxy_root_path=proxy_root_path,
        )

    for raw_cookie in upstream_response.headers.get_list("set-cookie"):
        rewritten_cookies = rewrite_set_cookie_header(
            raw_cookie,
            proxy_path=proxy_cookie_path,
        )
        for rewritten in rewritten_cookies:
            response.raw_headers.append((b"set-cookie", rewritten.encode("latin-1")))

    return response


def _require_running_sandbox(db: Session, session_id: UUID) -> str:
    """Return sandbox_id or raise 404."""
    sandbox_id = SandboxService.get_active_sandbox_id(db, session_id)
    if not sandbox_id:
        raise HTTPException(404, "No running sandbox for this session")
    return sandbox_id


def _get_running_sandbox_record(db: Session, session_id: UUID) -> SessionSandbox | None:
    return (
        db.query(SessionSandbox)
        .filter(
            SessionSandbox.session_id == session_id,
            SessionSandbox.status == "running",
        )
        .first()
    )


def _clear_terminal_session(record: SessionSandbox) -> None:
    record.terminal_session_id = None
    record.terminal_session_created_at = None
    record.terminal_session_last_seen_at = None


def _is_truthy(value: str | None) -> bool:
    return value is not None and value.lower() in {"1", "true", "yes", "on"}


def _rewrite_upstream_terminal_error(message: str) -> str | None:
    """Normalize known upstream terminal errors to actionable frontend messages."""
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None
    if payload.get("type") != "error":
        return None

    error_text = payload.get("error") or payload.get("message")
    if not isinstance(error_text, str):
        return None

    normalized = error_text.lower()
    if (
        "pty.startwithsize" in normalized
        and "bash" in normalized
        and "no such file or directory" in normalized
    ):
        payload["error"] = (
            "Upstream PTY failed to start bash (/usr/bin/bash). "
            "The sandbox may contain bash, but execd still cannot execute it "
            "(for example path/linker/shared-library mismatch, or PTY cwd does not exist). "
            "Please verify /usr/bin/bash and /bin/bash are executable inside the running sandbox, "
            "then recreate the sandbox."
        )
        payload["code"] = "PTY_BASH_START_FAILED"
        payload["details"] = error_text
        return json.dumps(payload)

    return None


def _extract_terminal_error_code(message: str) -> str | None:
    """Extract error code from terminal control frames when present."""
    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None
    if payload.get("type") != "error":
        return None

    code = payload.get("code")
    return code if isinstance(code, str) else None


# ---------------------------------------------------------------------------
# WebSocket terminal
# ---------------------------------------------------------------------------


@router.websocket("/sessions/{session_id}/sandbox/terminal")
async def sandbox_terminal(websocket: WebSocket, session_id: UUID):
    """Proxy a real OpenSandbox PTY session between browser and execd."""
    import asyncio
    from websockets.exceptions import ConnectionClosed, InvalidStatus

    from app.db.session import SessionLocal
    from app.sandbox import get_sandbox_client
    from app.sandbox.client import (
        SandboxPtySessionNotFoundError,
        SandboxPtyUnsupportedError,
    )
    from app.service.auth import TokenService
    from app.service.system_config import get_sandbox_config

    class _PtyBashStartFailed(Exception):
        """Raised when upstream PTY cannot start bash."""

    await websocket.accept()
    db = SessionLocal()
    upstream = None

    async def _send_error_frame(message: str, *, code: str | None = None) -> None:
        payload = {"type": "error", "error": message}
        if code:
            payload["code"] = code
        with contextlib.suppress(Exception):
            await websocket.send_json(payload)

    async def _drop_terminal_session(record: SessionSandbox, client) -> None:
        if not record.sandbox_id or not record.terminal_session_id:
            _clear_terminal_session(record)
            db.commit()
            return

        try:
            await client.delete_pty_session(
                record.sandbox_id,
                record.terminal_session_id,
            )
        except SandboxPtySessionNotFoundError:
            pass
        finally:
            _clear_terminal_session(record)
            db.commit()

    async def _ensure_terminal_session(
        record: SessionSandbox,
        client,
        *,
        reset: bool,
    ) -> str:
        if not record.sandbox_id:
            raise RuntimeError("Sandbox record missing sandbox_id")

        if reset:
            await _drop_terminal_session(record, client)

        now = datetime.now(timezone.utc)
        if record.terminal_session_id:
            try:
                await client.get_pty_session_status(
                    record.sandbox_id,
                    record.terminal_session_id,
                )
            except SandboxPtySessionNotFoundError:
                _clear_terminal_session(record)
                db.commit()
            else:
                record.terminal_session_last_seen_at = now
                db.commit()
                return record.terminal_session_id

        terminal_cwd = await client.resolve_pty_cwd(
            record.sandbox_id,
            preferred="/workspace",
        )
        terminal_session_id = await client.create_pty_session(
            record.sandbox_id,
            cwd=terminal_cwd,
        )
        record.terminal_session_id = terminal_session_id
        record.terminal_session_created_at = now
        record.terminal_session_last_seen_at = now
        db.commit()
        return terminal_session_id

    async def _connect_upstream(
        record: SessionSandbox,
        client,
        *,
        reset: bool,
        pty_mode: bool,
    ):
        retry_with_fresh_session = True
        next_reset = reset

        while True:
            terminal_session_id = await _ensure_terminal_session(
                record,
                client,
                reset=next_reset,
            )
            try:
                return await client.connect_pty_websocket(
                    record.sandbox_id,
                    terminal_session_id,
                    since=0,
                    pty=pty_mode,
                )
            except InvalidStatus as exc:
                status_code = getattr(exc.response, "status_code", None)
                if status_code == 404 and retry_with_fresh_session:
                    await _drop_terminal_session(record, client)
                    retry_with_fresh_session = False
                    next_reset = False
                    continue
                raise

    try:
        # --- Auth via query param (same pattern as agent_chat WS) ---
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Missing token")
            return

        try:
            payload = TokenService.decode_token(token)
            if not payload or payload.get("type") != "access":
                await websocket.close(code=4001, reason="Invalid token")
                return
            user_id = UUID(payload.get("sub"))
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return

        # --- Validate session ownership & running sandbox ---
        _validate_session_owner(db, session_id, user_id)
        record = _get_running_sandbox_record(db, session_id)
        if not record or not record.sandbox_id:
            await websocket.close(code=4004, reason="No running sandbox")
            return

        client = get_sandbox_client(get_sandbox_config(db))
        reset = _is_truthy(websocket.query_params.get("reset"))

        pty_mode = True

        while True:
            try:
                upstream = await _connect_upstream(
                    record,
                    client,
                    reset=reset,
                    pty_mode=pty_mode,
                )
            except SandboxPtyUnsupportedError:
                await _send_error_frame(
                    "Interactive PTY terminal is not supported by current sandbox runtime.",
                    code="PTY_UNSUPPORTED",
                )
                await websocket.close(code=1011, reason="PTY unsupported")
                return
            except InvalidStatus as exc:
                status_code = getattr(exc.response, "status_code", None)
                if status_code == 409:
                    await _send_error_frame(
                        "Terminal is already attached in another client.",
                        code="ALREADY_CONNECTED",
                    )
                    await websocket.close(code=4009, reason="Terminal already attached")
                    return
                await _send_error_frame(
                    f"Failed to attach terminal upstream (status {status_code}).",
                    code="UPSTREAM_ATTACH_FAILED",
                )
                await websocket.close(code=1011, reason="Failed to attach terminal")
                return

            async def _browser_to_upstream(active_upstream) -> None:
                while True:
                    message = await websocket.receive()
                    msg_type = message.get("type")
                    if msg_type == "websocket.disconnect":
                        return

                    text = message.get("text")
                    if text is not None:
                        await active_upstream.send(text)
                        continue

                    data = message.get("bytes")
                    if data is not None:
                        await active_upstream.send(data)

            async def _upstream_to_browser(active_upstream) -> None:
                async for message in active_upstream:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        rewritten = _rewrite_upstream_terminal_error(message)
                        outgoing = rewritten or message
                        await websocket.send_text(outgoing)

                        if _extract_terminal_error_code(outgoing) == "PTY_BASH_START_FAILED":
                            raise _PtyBashStartFailed()

            tasks = [
                asyncio.create_task(_browser_to_upstream(upstream)),
                asyncio.create_task(_upstream_to_browser(upstream)),
            ]
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

            failure: Exception | None = None
            for task in done:
                exc = task.exception()
                if isinstance(exc, _PtyBashStartFailed):
                    failure = exc
                    break
                if exc and not isinstance(
                    exc,
                    (WebSocketDisconnect, ConnectionClosed, asyncio.CancelledError),
                ):
                    raise exc

            if failure is None:
                break

            with contextlib.suppress(Exception):
                await upstream.close()

            if pty_mode:
                pty_mode = False
                reset = False
                await _send_error_frame(
                    "PTY mode startup failed. Switched to pipe mode for troubleshooting.",
                    code="PTY_PIPE_FALLBACK",
                )
                continue

            with contextlib.suppress(Exception):
                await _drop_terminal_session(record, client)
            await websocket.close(code=1011, reason="PTY bash start failed")
            return

    except Exception:
        logger.exception("Terminal WS error")
        await _send_error_frame("Terminal connection failed.", code="TERMINAL_PROXY_ERROR")
    finally:
        if upstream is not None:
            with contextlib.suppress(Exception):
                await upstream.close()
        with contextlib.suppress(Exception):
            await websocket.close()
        db.close()


# ---------------------------------------------------------------------------
# Sandbox administration (system-wide listing via OpenSandbox API)
# ---------------------------------------------------------------------------


def _require_sandbox_admin_config(db: Session):
    """Return sandbox config if the service is enabled and configured."""
    from app.service.system_config import get_sandbox_config

    cfg = get_sandbox_config(db)
    if not cfg.enabled:
        raise HTTPException(400, "Sandbox service is disabled")
    if not cfg.api_domain or not cfg.api_key:
        raise HTTPException(400, "Sandbox service is not fully configured")
    return cfg


@router.get(
    "/sandbox-admin/sandboxes",
    response_model=SandboxAdminListResponse,
)
async def admin_list_sandboxes(
    states: list[str] | None = Query(
        default=None,
        description="Filter by sandbox states (e.g. Running, Paused, Terminated)",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List sandboxes directly from the OpenSandbox admin API."""
    cfg = _require_sandbox_admin_config(db)
    from app.sandbox.admin import list_sandboxes, sandbox_info_to_dict

    try:
        result = await list_sandboxes(
            cfg,
            states=states,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        logger.exception("Failed to list sandboxes from OpenSandbox")
        raise HTTPException(502, f"Failed to list sandboxes: {exc}")

    return SandboxAdminListResponse(
        sandboxes=[
            SandboxAdminInfo(**sandbox_info_to_dict(info))
            for info in result.sandbox_infos
        ],
        pagination=SandboxAdminPagination(
            page=result.pagination.page,
            page_size=result.pagination.page_size,
            total_items=result.pagination.total_items,
            total_pages=result.pagination.total_pages,
            has_next_page=result.pagination.has_next_page,
        ),
    )


@router.get(
    "/sandbox-admin/sandboxes/{sandbox_id}",
    response_model=SandboxAdminInfo,
)
async def admin_get_sandbox(
    sandbox_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Fetch details for a single sandbox from the OpenSandbox admin API."""
    cfg = _require_sandbox_admin_config(db)
    from app.sandbox.admin import get_sandbox_info, sandbox_info_to_dict

    try:
        info = await get_sandbox_info(cfg, sandbox_id)
    except Exception as exc:
        logger.exception("Failed to fetch sandbox %s", sandbox_id)
        raise HTTPException(502, f"Failed to fetch sandbox: {exc}")

    return SandboxAdminInfo(**sandbox_info_to_dict(info))


@router.delete(
    "/sandbox-admin/sandboxes/{sandbox_id}",
    status_code=204,
)
async def admin_kill_sandbox(
    sandbox_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Terminate a sandbox via the OpenSandbox admin API.

    Also reconciles local SessionSandbox records so the session view stays
    consistent with the upstream state.
    """
    cfg = _require_sandbox_admin_config(db)
    from app.sandbox.admin import kill_sandbox

    try:
        await kill_sandbox(cfg, sandbox_id)
    except Exception as exc:
        logger.exception("Failed to kill sandbox %s", sandbox_id)
        raise HTTPException(502, f"Failed to kill sandbox: {exc}")

    # Best-effort local state reconciliation: mark matching SessionSandbox rows
    # as stopped so the per-session UI reflects the termination.
    try:
        rows = (
            db.query(SessionSandbox)
            .filter(SessionSandbox.sandbox_id == sandbox_id)
            .all()
        )
        for row in rows:
            row.status = "stopped"
        if rows:
            db.commit()
    except Exception:
        logger.exception("Failed to reconcile local SessionSandbox state")
        db.rollback()

    return Response(status_code=204)
