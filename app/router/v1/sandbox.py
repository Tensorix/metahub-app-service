"""API endpoints for per-session sandbox lifecycle and filesystem access."""

from __future__ import annotations

import contextlib
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.db.model import Session as SessionModel
from app.db.model.session_sandbox import SessionSandbox
from app.db.session import get_db
from app.deps import get_current_user
from app.db.model.user import User
from app.schema.sandbox import (
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
        env=body.env,
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
