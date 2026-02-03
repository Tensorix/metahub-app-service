"""
Filesystem API endpoints for DeepAgents file system access.

Provides:
- GET /sessions/{session_id}/files - List all files
- GET /sessions/{session_id}/files/read - Read file content
- POST /sessions/{session_id}/files/write - Write/update file
- DELETE /sessions/{session_id}/files - Delete file
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model import Session as SessionModel
from app.deps import get_current_user
from app.db.model.user import User
from app.agent import AgentFactory
from app.schema.filesystem import (
    FileInfo,
    FileListResponse,
    FileReadResponse,
    FileWriteRequest,
    FileWriteResponse,
    FileDeleteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Store active WebSocket connections for real-time updates
_file_watchers: dict[str, list[WebSocket]] = {}


async def _validate_session(
    session_id: UUID,
    db: Session,
    user_id: UUID,
) -> SessionModel:
    """
    Validate session exists and belongs to user.

    Returns:
        Session instance

    Raises:
        HTTPException if validation fails
    """
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == user_id,
        SessionModel.is_deleted == False,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


def _get_namespace(session_id: UUID) -> tuple:
    """
    Get the Store namespace for a session's filesystem.
    
    DeepAgents uses (assistant_id, "filesystem") as namespace.
    We use session_id as assistant_id.
    """
    return (str(session_id), "filesystem")


def _parse_file_info(key: str, value: dict) -> FileInfo:
    """Parse store item into FileInfo."""
    # Extract filename from path
    name = key.split("/")[-1] if "/" in key else key
    
    # Get metadata from value - handle various content formats
    if isinstance(value, dict):
        raw_content = value.get("content", "")
    else:
        raw_content = value
    
    # Calculate size based on content type
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
    
    return FileInfo(
        path=key,
        name=name,
        is_dir=False,  # StoreBackend doesn't have real directories
        size=size,
        modified_at=modified_at,
        created_at=created_at,
    )


@router.get("/sessions/{session_id}/files", response_model=FileListResponse)
async def list_files(
    session_id: UUID,
    path: str = Query("/", description="Directory path to list"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all files in the session's filesystem.
    
    Returns all files stored in the session's Store namespace.
    Files are organized by path prefix.
    """
    # Validate session belongs to user
    await _validate_session(session_id, db, current_user.id)
    
    # Get store
    store = await AgentFactory.get_store()
    namespace = _get_namespace(session_id)
    
    logger.info(f"Listing files for session {session_id}, namespace={namespace}, path={path}")
    
    files = []
    try:
        # Search all items in this session's filesystem namespace
        items = await store.asearch(namespace, limit=1000)
        
        for item in items:
            # Filter by path prefix if specified
            if path != "/" and not item.key.startswith(path):
                continue
            
            file_info = _parse_file_info(item.key, item.value)
            files.append(file_info)
        
        # Sort by path
        files.sort(key=lambda f: f.path)
        
        logger.info(f"Found {len(files)} files for session {session_id}")
        
    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")
    
    return FileListResponse(files=files, total=len(files))


@router.get("/sessions/{session_id}/files/read", response_model=FileReadResponse)
async def read_file(
    session_id: UUID,
    path: str = Query(..., description="File path to read"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Read content of a specific file.
    
    Returns the file content and metadata.
    """
    # Validate session belongs to user
    await _validate_session(session_id, db, current_user.id)
    
    # Get store
    store = await AgentFactory.get_store()
    namespace = _get_namespace(session_id)
    
    logger.info(f"Reading file {path} for session {session_id}")
    
    try:
        item = await store.aget(namespace, path)
        
        if not item:
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        
        # Extract content - handle various formats
        value = item.value
        if isinstance(value, dict):
            raw_content = value.get("content", "")
        else:
            raw_content = value
        
        # Convert content to string if it's a list or other type
        if isinstance(raw_content, list):
            content = "\n".join(str(item) for item in raw_content)
        elif isinstance(raw_content, str):
            content = raw_content
        else:
            content = str(raw_content) if raw_content else ""
        
        # Get modification time
        modified_at = None
        if isinstance(value, dict) and "modified_at" in value:
            try:
                modified_at = datetime.fromisoformat(value["modified_at"].replace("Z", "+00:00"))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Write or update a file.
    
    Creates the file if it doesn't exist, updates if it does.
    """
    # Validate session belongs to user
    await _validate_session(session_id, db, current_user.id)
    
    # Get store
    store = await AgentFactory.get_store()
    namespace = _get_namespace(session_id)
    
    logger.info(f"Writing file {request.path} for session {session_id}")
    
    try:
        # Check if file exists
        existing = await store.aget(namespace, request.path)
        created = existing is None
        
        # Create file data (matching DeepAgents format)
        # DeepAgents stores content as list of lines, not string
        now = datetime.now(timezone.utc)
        content_lines = request.content.split("\n") if request.content else []
        file_data = {
            "content": content_lines,
            "modified_at": now.isoformat(),
        }
        
        if created:
            file_data["created_at"] = now.isoformat()
        elif existing and isinstance(existing.value, dict):
            # Preserve created_at from existing file
            file_data["created_at"] = existing.value.get("created_at", now.isoformat())
        
        # Write to store
        await store.aput(namespace, request.path, file_data)
        
        logger.info(f"{'Created' if created else 'Updated'} file {request.path}")
        
        # Notify watchers
        await _notify_file_change(session_id, "created" if created else "updated", request.path)
        
        return FileWriteResponse(
            path=request.path,
            size=len(request.content),
            created=created,
            modified_at=now,
        )
        
    except Exception as e:
        logger.error(f"Error writing file {request.path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to write file: {str(e)}")


@router.delete("/sessions/{session_id}/files", response_model=FileDeleteResponse)
async def delete_file(
    session_id: UUID,
    path: str = Query(..., description="File path to delete"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a file.
    
    Permanently removes the file from the session's filesystem.
    """
    # Validate session belongs to user
    await _validate_session(session_id, db, current_user.id)
    
    # Get store
    store = await AgentFactory.get_store()
    namespace = _get_namespace(session_id)
    
    logger.info(f"Deleting file {path} for session {session_id}")
    
    try:
        # Check if file exists
        existing = await store.aget(namespace, path)
        if not existing:
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        
        # Delete from store
        await store.adelete(namespace, path)
        
        logger.info(f"Deleted file {path}")
        
        # Notify watchers
        await _notify_file_change(session_id, "deleted", path)
        
        return FileDeleteResponse(path=path, success=True)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting file {path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


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
    
    # Send to all watchers
    disconnected = []
    for ws in _file_watchers[session_key]:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.append(ws)
    
    # Remove disconnected watchers
    for ws in disconnected:
        _file_watchers[session_key].remove(ws)


@router.websocket("/sessions/{session_id}/files/watch")
async def watch_files(
    websocket: WebSocket,
    session_id: UUID,
    db: Session = Depends(get_db),
):
    """
    WebSocket endpoint for real-time file change notifications.
    
    Clients receive events when files are created, updated, or deleted.
    """
    await websocket.accept()
    
    session_key = str(session_id)
    
    # Add to watchers
    if session_key not in _file_watchers:
        _file_watchers[session_key] = []
    _file_watchers[session_key].append(websocket)
    
    logger.info(f"Client connected to file watcher for session {session_id}")
    
    try:
        # Keep connection alive and handle ping/pong
        while True:
            try:
                message = await websocket.receive_text()
                # Handle ping
                if message == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break
    finally:
        # Remove from watchers
        if session_key in _file_watchers and websocket in _file_watchers[session_key]:
            _file_watchers[session_key].remove(websocket)
        logger.info(f"Client disconnected from file watcher for session {session_id}")


# Export notify function for use by agent_chat router
async def notify_agent_file_change(session_id: UUID, event: str, path: str):
    """
    Notify watchers about file changes made by the agent.
    
    Called from agent_chat router when agent writes files.
    """
    await _notify_file_change(session_id, event, path)
