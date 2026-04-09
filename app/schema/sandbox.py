"""Pydantic schemas for sandbox API."""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class SandboxCreateRequest(BaseModel):
    image: Optional[str] = None
    timeout: Optional[int] = None
    env: Optional[dict[str, str]] = None


class SandboxConfigUpdateRequest(BaseModel):
    image: Optional[str] = None
    timeout: Optional[int] = None


class SandboxResponse(BaseModel):
    id: UUID
    session_id: UUID
    sandbox_id: Optional[str] = None
    status: str
    image: str
    timeout: Optional[int] = None
    config: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SandboxFileInfo(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None


class SandboxFileListResponse(BaseModel):
    files: list[SandboxFileInfo]


class SandboxFileReadResponse(BaseModel):
    path: str
    content: str


class SandboxFileWriteRequest(BaseModel):
    path: str
    content: str


class SandboxFileWriteResponse(BaseModel):
    path: str
    success: bool = True


class SandboxTransferRequest(BaseModel):
    source: Literal["store", "sandbox"]
    destination: Literal["store", "sandbox"]
    path: str
    dest_path: Optional[str] = None


class SandboxTransferResponse(BaseModel):
    source: str
    destination: str
    path: str
    dest_path: str
    success: bool = True


class SandboxRenewRequest(BaseModel):
    duration: int = 600


# ---------------------------------------------------------------------------
# Sandbox admin (system-wide listing / details via OpenSandbox API)
# ---------------------------------------------------------------------------


class SandboxAdminStatus(BaseModel):
    state: str
    reason: Optional[str] = None
    message: Optional[str] = None
    last_transition_at: Optional[datetime] = None


class SandboxAdminInfo(BaseModel):
    id: str
    status: SandboxAdminStatus
    entrypoint: list[str] = []
    image: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    metadata: Optional[dict[str, str]] = None


class SandboxAdminPagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next_page: bool


class SandboxAdminListResponse(BaseModel):
    sandboxes: list[SandboxAdminInfo]
    pagination: SandboxAdminPagination
