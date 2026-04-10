"""Pydantic schemas for sandbox API."""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, computed_field, field_validator


class SandboxHostMount(BaseModel):
    host_path: str = Field(..., description="Absolute host path to mount")
    mount_path: str = Field(..., description="Absolute mount path inside sandbox")
    read_only: bool = Field(False, description="Whether the mount is read-only")
    sub_path: Optional[str] = Field(
        None,
        description="Optional sub-path within the host path to mount",
    )

    @field_validator("host_path", "mount_path")
    @classmethod
    def _validate_absolute_path(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned.startswith("/"):
            raise ValueError("Mount paths must be absolute")
        return cleaned

    @field_validator("sub_path")
    @classmethod
    def _validate_sub_path(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class SandboxCreateRequest(BaseModel):
    image: Optional[str] = None
    timeout: Optional[int] = None
    env: Optional[dict[str, str]] = None
    mounts: Optional[list[SandboxHostMount]] = None

    @field_validator("timeout")
    @classmethod
    def _validate_timeout(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value <= 0:
            raise ValueError("Timeout must be a positive number")
        return value


class SandboxConfigUpdateRequest(BaseModel):
    image: Optional[str] = None
    timeout: Optional[int] = None
    mounts: Optional[list[SandboxHostMount]] = None

    @field_validator("timeout")
    @classmethod
    def _validate_timeout(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value <= 0:
            raise ValueError("Timeout must be a positive number")
        return value


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

    @computed_field
    @property
    def mounts(self) -> list[SandboxHostMount]:
        raw = self.config.get("mounts") if isinstance(self.config, dict) else None
        if not isinstance(raw, list):
            return []

        mounts: list[SandboxHostMount] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            try:
                mounts.append(SandboxHostMount(**item))
            except Exception:
                continue
        return mounts


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
