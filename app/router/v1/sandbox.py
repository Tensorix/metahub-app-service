"""API endpoints for per-session sandbox lifecycle and filesystem access."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
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
