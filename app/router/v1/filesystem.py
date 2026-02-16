"""
Filesystem API endpoints for DeepAgents two-tier file system access.

Two-tier lifecycle:
- Root `/` → thread lifecycle, stored in ("topic_{topic_id}", "filesystem")
  - /AGENTS.md (readonly, mounted from agent memory config)
  - /skills/* (readonly, mounted from agent config)
  - agent temp files (read/write)
- /workspace/ → session lifecycle, stored in (session_id, "filesystem")
  - shared across all threads in the session

Provides:
- GET /sessions/{session_id}/files - List files (both namespaces)
- GET /sessions/{session_id}/files/read - Read file content
- POST /sessions/{session_id}/files/write - Write/update file
- DELETE /sessions/{session_id}/files - Delete file
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model import Session as SessionModel
from app.deps import get_current_user
from app.db.model.user import User
from app.agent import AgentFactory
from app.schema.filesystem import (
    FileInfo,
    FileDeleteResponse,
    FileListResponse,
    FileReadResponse,
    FileWriteRequest,
    FileWriteResponse,
    MkdirRequest,
    MkdirResponse,
    MoveRequest,
    MoveResponse,
    UploadResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Store active WebSocket connections for real-time updates
_file_watchers: dict[str, list[WebSocket]] = {}

# --- Constants ---
WORKSPACE_PREFIX = "/workspace"
WORKSPACE_ROUTE = "/workspace/"
MOUNTED_READONLY_PREFIXES = ("/AGENTS.md", "/skills/")


# --- Namespace helpers ---

def _get_thread_namespace(topic_id: UUID) -> tuple:
    """Namespace for root files (thread lifecycle).

    Must match agent_chat.py's thread_id format: f"topic_{topic.id}"
    """
    return (f"topic_{topic_id}", "filesystem")


def _get_session_namespace(session_id: UUID) -> tuple:
    """Namespace for workspace files (session lifecycle)."""
    return (str(session_id), "filesystem")


def _is_workspace_path(path: str) -> bool:
    """Check if path targets the workspace subtree."""
    return path == WORKSPACE_PREFIX or path.startswith(WORKSPACE_ROUTE)


def _strip_workspace_prefix(path: str) -> str:
    """Strip /workspace prefix, returning the inner store key."""
    if path.startswith(WORKSPACE_ROUTE):
        return "/" + path[len(WORKSPACE_ROUTE):]
    if path == WORKSPACE_PREFIX:
        return "/"
    return path


def _is_mounted_readonly(path: str) -> bool:
    """Check if path is a readonly mounted file (AGENTS.md/skills)."""
    return any(path == prefix or path.startswith(prefix) for prefix in MOUNTED_READONLY_PREFIXES)


def _resolve_namespace(
    path: str,
    session_id: UUID,
    topic_id: Optional[UUID],
) -> tuple[tuple, str]:
    """Resolve store namespace and key for a given path.

    Routing rules:
    - /workspace/* → always session namespace, strip prefix
    - Other paths → thread namespace (topic_id required)

    Returns:
        (namespace_tuple, store_key)

    Raises:
        HTTPException 400 if topic_id is missing for non-workspace paths.
    """
    if _is_workspace_path(path):
        return _get_session_namespace(session_id), _strip_workspace_prefix(path)

    if not topic_id:
        raise HTTPException(
            status_code=400,
            detail="topic_id is required for root file operations",
        )
    return _get_thread_namespace(topic_id), path


# --- Validation ---

async def _validate_session(
    session_id: UUID,
    db: Session,
    user_id: UUID,
) -> SessionModel:
    """Validate session exists and belongs to user.

    Eagerly loads the agent relationship to avoid lazy-load issues
    when accessed later in async code.
    """
    from sqlalchemy.orm import joinedload

    session = db.query(SessionModel).options(
        joinedload(SessionModel.agent)
    ).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == user_id,
        SessionModel.is_deleted == False,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


# --- Mounted files lazy init ---

async def _ensure_mounted_files(
    topic_id: UUID,
    session: SessionModel,
    store,
) -> None:
    """Ensure AGENTS.md and skills are written to the thread store.

    Lazy-init: on the first list_files call for a topic, writes the
    mounted files so they're visible before the first chat message.
    Subsequent calls are a no-op because store.aput is an upsert.
    """
    if not session.agent_id:
        logger.debug(f"No agent_id on session, skipping mounted files init")
        return

    thread_ns = _get_thread_namespace(topic_id)

    # Agent should be eagerly loaded by _validate_session (joinedload)
    agent = session.agent
    if not agent:
        logger.warning(f"Session {session.id} has agent_id={session.agent_id} but agent relationship is None")
        return

    from deepagents.backends.utils import create_file_data

    written = 0

    # Write AGENTS.md from memory config (root readonly memory file)
    memory_content = ""
    for item in (agent.memory_files or []):
        name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
        content = item.get("content") if isinstance(item, dict) else getattr(item, "content", None)
        normalized = (name or "").strip().lower().removesuffix(".md")
        if normalized == "agents":
            memory_content = content or ""
            break
        if not memory_content and content:
            memory_content = content

    if memory_content:
        await store.aput(thread_ns, "/AGENTS.md", create_file_data(memory_content))
        written += 1

    # Write skills
    skills_data = agent.skills or []
    for skill in skills_data:
        name = skill.get("name") if isinstance(skill, dict) else getattr(skill, "name", None)
        content = skill.get("content") if isinstance(skill, dict) else getattr(skill, "content", None)
        if name and content:
            path = f"/skills/{name}/SKILL.md"
            await store.aput(thread_ns, path, create_file_data(content))
            written += 1

    logger.info(f"Lazy-initialized {written} mounted file(s) for topic={topic_id}, namespace={thread_ns}")


# --- File parsing ---

def _parse_file_info(
    key: str,
    value: dict,
    *,
    lifecycle: str = "session",
    path_prefix: str = "",
    readonly: bool = False,
) -> FileInfo:
    """Parse store item into FileInfo with lifecycle metadata."""
    display_path = path_prefix + key if path_prefix else key
    name = display_path.rsplit("/", 1)[-1] if "/" in display_path else display_path

    # Directory marker (empty folder persisted with __type: directory)
    if isinstance(value, dict) and value.get("__type") == "directory":
        created_at = None
        if "created_at" in value:
            try:
                created_at = datetime.fromisoformat(value["created_at"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        return FileInfo(
            path=display_path,
            name=name,
            is_dir=True,
            size=None,
            modified_at=None,
            created_at=created_at,
            lifecycle=lifecycle,
            readonly=False,
        )

    # Get content from value
    if isinstance(value, dict):
        raw_content = value.get("content", "")
    else:
        raw_content = value

    # Calculate size
    if isinstance(raw_content, list):
        size = sum(len(str(item)) for item in raw_content)
    elif isinstance(raw_content, str):
        size = len(raw_content)
    else:
        size = len(str(raw_content)) if raw_content else 0

    modified_at = None
    created_at = None

    if isinstance(value, dict):
        if "modified_at" in value:
            try:
                modified_at = datetime.fromisoformat(value["modified_at"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        if "created_at" in value:
            try:
                created_at = datetime.fromisoformat(value["created_at"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

    file_readonly = readonly or _is_mounted_readonly(display_path)

    return FileInfo(
        path=display_path,
        name=name,
        is_dir=False,
        size=size,
        modified_at=modified_at,
        created_at=created_at,
        lifecycle=lifecycle,
        readonly=file_readonly,
    )


def _extract_content(value) -> str:
    """Extract string content from store item value."""
    if isinstance(value, dict):
        raw_content = value.get("content", "")
    else:
        raw_content = value

    if isinstance(raw_content, list):
        return "\n".join(str(line) for line in raw_content)
    elif isinstance(raw_content, str):
        return raw_content
    else:
        return str(raw_content) if raw_content else ""


# --- Endpoints ---

@router.get("/sessions/{session_id}/files", response_model=FileListResponse)
async def list_files(
    session_id: UUID,
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root files (thread lifecycle)"),
    path: str = Query("/", description="Directory path to list"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List files in the session's filesystem.

    Requires topic_id to show the full two-tier view:
    - Root files from thread namespace (lifecycle="thread")
    - Workspace files from session namespace (lifecycle="session", prefixed /workspace)
    - Lazy-inits AGENTS.md and skills on first call for a topic.

    Without topic_id, only workspace files are returned.
    """
    session = await _validate_session(session_id, db, current_user.id)

    store = await AgentFactory.get_store()
    files: list[FileInfo] = []

    try:
        # Thread-scoped root files (requires topic_id)
        if topic_id and (path == "/" or not _is_workspace_path(path)):
            await _ensure_mounted_files(topic_id, session, store)

            thread_ns = _get_thread_namespace(topic_id)
            logger.debug(f"Searching thread namespace {thread_ns}")
            items = await store.asearch(thread_ns, limit=1000)
            logger.debug(f"Found {len(items)} items in thread namespace")

            for item in items:
                if path != "/" and not item.key.startswith(path):
                    continue
                files.append(_parse_file_info(
                    item.key, item.value,
                    lifecycle="thread",
                ))
        elif not topic_id:
            logger.debug(f"No topic_id provided, skipping thread namespace")

        # Session-scoped workspace files
        if path == "/" or _is_workspace_path(path):
            session_ns = _get_session_namespace(session_id)
            items = await store.asearch(session_ns, limit=1000)
            inner_filter = _strip_workspace_prefix(path) if _is_workspace_path(path) else None

            workspace_has_files = False
            for item in items:
                if item.key == "/.workspace":
                    continue
                if inner_filter and inner_filter != "/" and not item.key.startswith(inner_filter):
                    continue
                workspace_has_files = True
                files.append(_parse_file_info(
                    item.key, item.value,
                    lifecycle="session",
                    path_prefix=WORKSPACE_PREFIX,
                ))

            # Always show /workspace as a virtual directory at root listing
            if path == "/" and session.agent_id:
                files.append(FileInfo(
                    path="/workspace",
                    name="workspace",
                    is_dir=True,
                    size=None,
                    modified_at=None,
                    created_at=None,
                    lifecycle="session",
                    readonly=False,
                ))

        files.sort(key=lambda f: f.path)
        logger.info(f"Listed {len(files)} files for session={session_id}, topic={topic_id}, path={path}")

    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

    return FileListResponse(files=files, total=len(files))


@router.get("/sessions/{session_id}/files/read", response_model=FileReadResponse)
async def read_file(
    session_id: UUID,
    path: str = Query(..., description="File path to read"),
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root files"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Read content of a specific file.

    - /workspace/* → session namespace
    - Other paths → thread namespace (topic_id required, 400 if missing)
    """
    await _validate_session(session_id, db, current_user.id)

    store = await AgentFactory.get_store()
    namespace, store_key = _resolve_namespace(path, session_id, topic_id)

    logger.info(f"Reading file {path} (store_key={store_key}, namespace={namespace})")

    try:
        item = await store.aget(namespace, store_key)
        if not item:
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        content = _extract_content(item.value)

        modified_at = None
        if isinstance(item.value, dict) and "modified_at" in item.value:
            try:
                modified_at = datetime.fromisoformat(
                    item.value["modified_at"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        return FileReadResponse(
            path=path,
            content=content,
            size=len(content),
            modified_at=modified_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading file {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")


@router.post("/sessions/{session_id}/files/write", response_model=FileWriteResponse)
async def write_file(
    session_id: UUID,
    request: FileWriteRequest,
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root files"),
    create_only: bool = Query(False, description="If True, fail with 409 when file already exists"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Write or update a file.

    - /AGENTS.md and /skills/* are readonly (403)
    - /workspace/* → session namespace
    - With topic_id → thread namespace
    - Other paths → thread namespace (topic_id required, 400 if missing)
    """
    await _validate_session(session_id, db, current_user.id)

    if _is_mounted_readonly(request.path):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot write to mounted readonly file: {request.path}",
        )

    store = await AgentFactory.get_store()
    namespace, store_key = _resolve_namespace(request.path, session_id, topic_id)

    logger.info(f"Writing file {request.path} (store_key={store_key}, namespace={namespace})")

    try:
        existing = await store.aget(namespace, store_key)
        created = existing is None

        if create_only and existing:
            raise HTTPException(
                status_code=409,
                detail=f"File already exists: {request.path}",
            )

        now = datetime.now(timezone.utc)
        content_lines = request.content.split("\n") if request.content else []
        file_data = {
            "content": content_lines,
            "modified_at": now.isoformat(),
        }

        if created:
            file_data["created_at"] = now.isoformat()
        elif existing and isinstance(existing.value, dict):
            file_data["created_at"] = existing.value.get("created_at", now.isoformat())

        await store.aput(namespace, store_key, file_data)

        logger.info(f"{'Created' if created else 'Updated'} file {request.path}")
        await _notify_file_change(session_id, "created" if created else "updated", request.path)

        return FileWriteResponse(
            path=request.path,
            size=len(request.content),
            created=created,
            modified_at=now,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error writing file {request.path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to write file: {str(e)}")


@router.post("/sessions/{session_id}/files/mkdir", response_model=MkdirResponse)
async def mkdir(
    session_id: UUID,
    request: MkdirRequest,
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root paths"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a directory.

    - /workspace/* → session namespace
    - Other paths → thread namespace (topic_id required)
    """
    await _validate_session(session_id, db, current_user.id)

    path = request.path.rstrip("/")
    if not path or path == "/":
        raise HTTPException(status_code=400, detail="Invalid directory path")

    if _is_mounted_readonly(path):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot create directory under readonly path: {path}",
        )

    store = await AgentFactory.get_store()
    namespace, store_key = _resolve_namespace(path, session_id, topic_id)
    store_key = store_key.rstrip("/") or "/"

    logger.info(f"Creating directory {path} (store_key={store_key})")

    try:
        existing = await store.aget(namespace, store_key)
        if existing:
            if isinstance(existing.value, dict) and existing.value.get("__type") == "directory":
                raise HTTPException(
                    status_code=409,
                    detail=f"Directory already exists: {path}",
                )
            raise HTTPException(
                status_code=400,
                detail=f"Path exists and is not a directory: {path}",
            )

        now = datetime.now(timezone.utc)
        dir_data = {"__type": "directory", "created_at": now.isoformat()}
        await store.aput(namespace, store_key, dir_data)

        logger.info(f"Created directory {path}")
        await _notify_file_change(session_id, "created", path)

        return MkdirResponse(path=path, created=True)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating directory {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create directory: {str(e)}")


@router.post("/sessions/{session_id}/files/move", response_model=MoveResponse)
async def move_file(
    session_id: UUID,
    request: MoveRequest,
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root paths"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Move or rename a file or folder.

    Supports recursive move: when source is a directory, moves all children.
    Source and destination must be in the same namespace (both workspace or both thread).
    """
    await _validate_session(session_id, db, current_user.id)

    source = request.source.rstrip("/") if request.source != "/" else request.source
    dest = request.destination.rstrip("/") if request.destination != "/" else request.destination

    if not source or not dest:
        raise HTTPException(status_code=400, detail="Invalid source or destination path")

    if _is_mounted_readonly(source) or _is_mounted_readonly(dest):
        raise HTTPException(
            status_code=403,
            detail="Cannot move mounted readonly files",
        )

    store = await AgentFactory.get_store()
    src_ns, src_key = _resolve_namespace(source, session_id, topic_id)
    dst_ns, dst_key = _resolve_namespace(dest, session_id, topic_id)

    if src_ns != dst_ns:
        raise HTTPException(
            status_code=400,
            detail="Cannot move between thread and session namespaces",
        )

    # Normalize keys for prefix match
    src_prefix = src_key if src_key.endswith("/") or src_key == "/" else src_key + "/"
    if src_key == "/":
        src_prefix = "/"

    try:
        items = await store.asearch(src_ns, limit=2000)
        to_move = []

        for item in items:
            if item.key == "/.workspace":
                continue
            # Match exact or children (for directory move)
            if item.key == src_key or (
                src_key != "/" and item.key.startswith(src_prefix)
            ):
                to_move.append((item.key, item.value))

        if not to_move:
            raise HTTPException(status_code=404, detail=f"Source not found: {source}")

        # Compute dest keys: replace src_prefix with dst_prefix
        dst_prefix = dst_key.rstrip("/")
        if "/" in dst_prefix:
            dst_prefix = dst_prefix + "/"
        else:
            dst_prefix = dst_prefix + "/"

        moved_count = 0
        for old_key, value in to_move:
            if old_key == src_key:
                new_key = dst_key
            elif src_key == "/":
                new_key = dst_key.rstrip("/") + old_key
            else:
                suffix = old_key[len(src_key):]
                new_key = (dst_key.rstrip("/") + suffix) if suffix.startswith("/") else (dst_key.rstrip("/") + "/" + suffix)

            await store.aput(src_ns, new_key, value)
            await store.adelete(src_ns, old_key)
            moved_count += 1

        # Notify for each path (simplified: notify source and dest)
        await _notify_file_change(session_id, "deleted", source)
        await _notify_file_change(session_id, "created", dest)

        logger.info(f"Moved {source} -> {dest} ({moved_count} items)")
        return MoveResponse(source=source, destination=dest, moved_count=moved_count)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error moving {source} to {dest}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to move: {str(e)}")


@router.post("/sessions/{session_id}/files/upload", response_model=UploadResponse)
async def upload_file(
    session_id: UUID,
    file: UploadFile = File(...),
    path: str = Query("/", description="Target directory for upload"),
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root paths"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a file into the session filesystem.

    - Text files: stored as line array (same as write)
    - Binary files: stored as base64-encoded content with __encoding: base64 marker
    - path: target directory, e.g. /workspace or /workspace/docs
    """
    await _validate_session(session_id, db, current_user.id)

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    target_dir = path.rstrip("/") or "/"
    file_path = f"{target_dir}/{file.filename}" if target_dir != "/" else f"/{file.filename}"

    if _is_mounted_readonly(file_path):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot upload to readonly path: {file_path}",
        )

    store = await AgentFactory.get_store()
    namespace, store_key = _resolve_namespace(file_path, session_id, topic_id)

    try:
        content_bytes = await file.read()
        now = datetime.now(timezone.utc)

        # Try to decode as text
        try:
            text = content_bytes.decode("utf-8")
            content_lines = text.split("\n")
            file_data = {
                "content": content_lines,
                "modified_at": now.isoformat(),
            }
        except UnicodeDecodeError:
            # Binary: store as base64
            import base64
            file_data = {
                "content": [base64.b64encode(content_bytes).decode("ascii")],
                "__encoding": "base64",
                "modified_at": now.isoformat(),
            }

        existing = await store.aget(namespace, store_key)
        created = existing is None
        if created:
            file_data["created_at"] = now.isoformat()
        elif existing and isinstance(existing.value, dict):
            file_data["created_at"] = existing.value.get("created_at", now.isoformat())

        await store.aput(namespace, store_key, file_data)

        logger.info(f"Uploaded file {file_path}")
        await _notify_file_change(session_id, "created" if created else "updated", file_path)

        return UploadResponse(
            path=file_path,
            size=len(content_bytes),
            created=created,
            modified_at=now,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading {file_path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")


@router.delete("/sessions/{session_id}/files", response_model=FileDeleteResponse)
async def delete_file(
    session_id: UUID,
    path: str = Query(..., description="File or directory path to delete"),
    recursive: bool = Query(False, description="If True, recursively delete directory and all children"),
    topic_id: Optional[UUID] = Query(None, description="Topic ID for root files"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a file or directory.

    - recursive=True: delete directory and all its contents
    - /AGENTS.md and /skills/* are readonly (403)
    - /workspace/* → session namespace
    - Other paths → thread namespace (topic_id required, 400 if missing)
    """
    await _validate_session(session_id, db, current_user.id)

    if _is_mounted_readonly(path):
        raise HTTPException(
            status_code=403,
            detail=f"Cannot delete mounted readonly file: {path}",
        )

    store = await AgentFactory.get_store()
    namespace, store_key = _resolve_namespace(path, session_id, topic_id)
    store_key = store_key.rstrip("/") or store_key

    logger.info(f"Deleting {path} (recursive={recursive})")

    try:
        if recursive:
            prefix = store_key if store_key.endswith("/") else store_key + "/"
            items = await store.asearch(namespace, limit=2000)
            deleted = 0
            for item in items:
                if item.key == "/.workspace":
                    continue
                if item.key == store_key or (store_key != "/" and item.key.startswith(prefix)):
                    await store.adelete(namespace, item.key)
                    deleted += 1
            if deleted == 0:
                raise HTTPException(status_code=404, detail=f"Path not found: {path}")
            logger.info(f"Recursively deleted {path} ({deleted} items)")
            await _notify_file_change(session_id, "deleted", path)
            return FileDeleteResponse(path=path, success=True)

        existing = await store.aget(namespace, store_key)
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"File not found: {path} (use recursive=True for directories)",
            )

        await store.adelete(namespace, store_key)

        logger.info(f"Deleted file {path}")
        await _notify_file_change(session_id, "deleted", path)

        return FileDeleteResponse(path=path, success=True)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")


# --- WebSocket / Notifications ---

async def _notify_file_change(session_id: UUID, event: str, path: str):
    """Notify all watchers about a file change."""
    session_key = str(session_id)
    if session_key not in _file_watchers:
        return

    message = {
        "event": event,
        "path": path,
        "session_id": session_key,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    disconnected = []
    for ws in _file_watchers[session_key]:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        _file_watchers[session_key].remove(ws)


@router.websocket("/sessions/{session_id}/files/watch")
async def watch_files(
    websocket: WebSocket,
    session_id: UUID,
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for real-time file change notifications."""
    await websocket.accept()

    session_key = str(session_id)

    if session_key not in _file_watchers:
        _file_watchers[session_key] = []
    _file_watchers[session_key].append(websocket)

    logger.info(f"Client connected to file watcher for session {session_id}")

    try:
        while True:
            try:
                message = await websocket.receive_text()
                if message == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break
    finally:
        if session_key in _file_watchers and websocket in _file_watchers[session_key]:
            _file_watchers[session_key].remove(websocket)
        logger.info(f"Client disconnected from file watcher for session {session_id}")


# Export notify function for use by agent_chat router
async def notify_agent_file_change(session_id: UUID, event: str, path: str):
    """Notify watchers about file changes made by the agent."""
    await _notify_file_change(session_id, event, path)
