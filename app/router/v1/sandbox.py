"""API endpoints for per-session sandbox lifecycle and filesystem access."""

from __future__ import annotations

import contextlib
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model import Session as SessionModel
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


# ---------------------------------------------------------------------------
# WebSocket terminal
# ---------------------------------------------------------------------------


@router.websocket("/sessions/{session_id}/sandbox/terminal")
async def sandbox_terminal(websocket: WebSocket, session_id: UUID):
    """Interactive terminal over WebSocket with streamed output.

    Each command is executed via ``sandbox.commands.run()`` (no persistent
    session required).  The working directory is tracked server-side and
    injected as a ``cd`` prefix for every command.  A sentinel marker on
    stderr captures the post-command cwd so that ``cd`` works naturally.

    Commands run as ``asyncio.Task`` so the message loop stays responsive
    to interrupt requests (Ctrl-C).  The ``on_init`` handler captures the
    execution ID as soon as the sandbox assigns it, and the
    ``on_execution_complete`` / ``on_error`` handlers send the ``exit``
    message immediately — avoiding the 1-2 s delay that would otherwise
    occur while waiting for the SDK to finalise the SSE stream.

    Client → Server:
      {"type": "command", "command": "ls -la"}
      {"type": "interrupt"}

    Server → Client:
      {"type": "ready", "cwd": "/workspace"}
      {"type": "stdout", "text": "..."}
      {"type": "stderr", "text": "..."}
      {"type": "exit", "code": 0}
      {"type": "cwd", "path": "/workspace"}
      {"type": "error", "message": "..."}
    """
    import asyncio

    from app.db.session import SessionLocal
    from app.sandbox import get_sandbox_client
    from app.sandbox.client import SandboxClient
    from app.service.auth import TokenService
    from app.service.system_config import get_sandbox_config

    await websocket.accept()
    db = SessionLocal()

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
        sandbox_id = SandboxService.get_active_sandbox_id(db, session_id)
        if not sandbox_id:
            await websocket.close(code=4004, reason="No running sandbox")
            return

        client = get_sandbox_client(get_sandbox_config(db))
        cwd = "/workspace"
        sentinel = SandboxClient.CWD_SENTINEL

        await websocket.send_json({"type": "ready", "cwd": cwd})

        # Shared mutable state between the message loop and command tasks.
        current_execution_id: str | None = None
        command_task: asyncio.Task | None = None

        async def _run_command(command: str) -> None:
            """Execute a single command in the background.

            Streams output over the WebSocket, sends ``exit`` + ``cwd``
            immediately when the SDK fires the completion/error event,
            then lets ``run_terminal_command`` finish cleaning up.
            """
            nonlocal cwd, current_execution_id

            new_cwd: list[str] = []
            exit_sent = False

            # -- streaming handlers (called by SDK during SSE processing) --

            async def _on_init(init_event):
                nonlocal current_execution_id
                current_execution_id = init_event.id

            async def _on_stdout(msg):
                await websocket.send_json(
                    {"type": "stdout", "text": msg.text}
                )

            async def _on_stderr(msg):
                text: str = msg.text
                if sentinel in text:
                    start = text.index(sentinel) + len(sentinel)
                    end = text.index(sentinel, start)
                    new_cwd.append(text[start:end].strip())
                    remaining = (
                        text[: text.index(sentinel)]
                        + text[end + len(sentinel) :]
                    )
                    remaining = remaining.strip()
                    if remaining:
                        await websocket.send_json(
                            {"type": "stderr", "text": remaining}
                        )
                    return
                await websocket.send_json(
                    {"type": "stderr", "text": text}
                )

            async def _send_exit_and_cwd(code: int) -> None:
                """Send exit + cwd immediately (called from event handlers)."""
                nonlocal cwd, exit_sent
                if exit_sent:
                    return
                exit_sent = True
                await websocket.send_json({"type": "exit", "code": code})
                if new_cwd:
                    cwd = new_cwd[0]
                    await websocket.send_json({"type": "cwd", "path": cwd})

            async def _on_execution_complete(_complete_event):
                await _send_exit_and_cwd(0)

            async def _on_error(error_event):
                try:
                    code = int(error_event.value)
                except (TypeError, ValueError):
                    code = 1
                await _send_exit_and_cwd(code)

            try:
                execution = await client.run_terminal_command(
                    sandbox_id,
                    command,
                    cwd=cwd,
                    on_stdout=_on_stdout,
                    on_stderr=_on_stderr,
                    on_init=_on_init,
                    on_execution_complete=_on_execution_complete,
                    on_error=_on_error,
                )
                # Fallback: send exit if the event handlers did not fire
                if not exit_sent:
                    await _send_exit_and_cwd(
                        execution.exit_code if execution.exit_code is not None else 1
                    )
            except asyncio.CancelledError:
                if not exit_sent:
                    await websocket.send_json(
                        {"type": "exit", "code": 130}  # SIGINT convention
                    )
            except Exception as exc:
                logger.exception("Terminal command error")
                if not exit_sent:
                    await websocket.send_json(
                        {"type": "error", "message": str(exc)}
                    )
            finally:
                current_execution_id = None

        # --- Message loop (always responsive) ---
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "command":
                command = data.get("command", "").strip()
                if not command:
                    continue
                # Ignore new commands while one is already running
                if command_task and not command_task.done():
                    continue
                command_task = asyncio.create_task(_run_command(command))

            elif msg_type == "interrupt":
                if current_execution_id:
                    try:
                        await client.interrupt_execution(
                            sandbox_id, current_execution_id
                        )
                    except Exception:
                        logger.warning(
                            "Failed to interrupt execution %s",
                            current_execution_id,
                        )

    except Exception as exc:
        # WebSocket disconnect or unexpected error
        if "disconnect" not in str(exc).lower():
            logger.exception("Terminal WS error")
    finally:
        # Cancel any running command task on disconnect
        try:
            if command_task and not command_task.done():
                command_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await command_task
        except NameError:
            pass  # command_task not yet defined (early auth failure)
        db.close()
