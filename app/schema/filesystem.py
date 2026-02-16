"""
Filesystem API schemas for DeepAgents file system access.

Provides request/response models for:
- Listing files
- Reading file content
- Writing/updating files
- Deleting files
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class FileInfo(BaseModel):
    """File or directory information."""

    path: str = Field(..., description="File path (e.g., /workspace/notes.txt)")
    name: str = Field(..., description="File name")
    is_dir: bool = Field(False, description="Whether this is a directory")
    size: Optional[int] = Field(None, description="File size in bytes")
    modified_at: Optional[datetime] = Field(None, description="Last modification time")
    created_at: Optional[datetime] = Field(None, description="Creation time")
    lifecycle: Optional[str] = Field(None, description="'thread' or 'session'")
    readonly: bool = Field(False, description="True for agent-mounted files (Agent.md, skills)")


class FileListResponse(BaseModel):
    """Response for listing files."""
    
    files: list[FileInfo] = Field(default_factory=list, description="List of files")
    total: int = Field(0, description="Total number of files")


class FileReadRequest(BaseModel):
    """Request for reading a file."""
    
    path: str = Field(..., description="File path to read")
    offset: Optional[int] = Field(0, description="Line offset to start reading from")
    limit: Optional[int] = Field(None, description="Maximum lines to read")


class FileReadResponse(BaseModel):
    """Response for reading a file."""
    
    path: str = Field(..., description="File path")
    content: str = Field(..., description="File content")
    size: int = Field(..., description="Content size in bytes")
    modified_at: Optional[datetime] = Field(None, description="Last modification time")


class FileWriteRequest(BaseModel):
    """Request for writing a file."""
    
    path: str = Field(..., description="File path to write")
    content: str = Field(..., description="File content to write")


class FileWriteResponse(BaseModel):
    """Response for writing a file."""
    
    path: str = Field(..., description="File path")
    size: int = Field(..., description="Written content size in bytes")
    created: bool = Field(..., description="Whether the file was newly created")
    modified_at: datetime = Field(..., description="Modification time")


class FileDeleteRequest(BaseModel):
    """Request for deleting a file."""
    
    path: str = Field(..., description="File path to delete")


class FileDeleteResponse(BaseModel):
    """Response for deleting a file."""
    
    path: str = Field(..., description="Deleted file path")
    success: bool = Field(..., description="Whether deletion was successful")


class FileEvent(BaseModel):
    """File system event for real-time updates."""
    
    event: str = Field(..., description="Event type: created, updated, deleted")
    path: str = Field(..., description="Affected file path")
    session_id: str = Field(..., description="Session ID")
    timestamp: datetime = Field(..., description="Event timestamp")


class MkdirRequest(BaseModel):
    """Request for creating a directory."""

    path: str = Field(..., description="Directory path, e.g. /workspace/reports")


class MkdirResponse(BaseModel):
    """Response after creating a directory."""

    path: str = Field(..., description="Created directory path")
    created: bool = Field(..., description="Whether the directory was newly created")


class MoveRequest(BaseModel):
    """Request for moving/renaming a file or folder."""

    source: str = Field(..., description="Source path")
    destination: str = Field(..., description="Destination path")


class MoveResponse(BaseModel):
    """Response after moving files."""

    source: str = Field(..., description="Source path")
    destination: str = Field(..., description="Destination path")
    moved_count: int = Field(..., description="Number of files moved (including children)")


class UploadResponse(BaseModel):
    """Response after uploading a file."""

    path: str = Field(..., description="Uploaded file path")
    size: int = Field(..., description="File size in bytes")
    created: bool = Field(..., description="Whether the file was newly created")
    modified_at: datetime = Field(..., description="Modification time")
