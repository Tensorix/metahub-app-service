# app/schema/scheduled_task.py

"""Pydantic schemas for the scheduled-task API."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ------------------------------------------------------------------ #
# Task-specific params (for validation)
# ------------------------------------------------------------------ #


class SendMessageTaskParams(BaseModel):
    """task_params schema for send_message task_type."""

    session_id: UUID = Field(..., description="Target session UUID")
    content: str = Field(..., min_length=1, description="Message content")
    topic_id: Optional[UUID] = Field(None, description="For AI sessions only; omit for PM/group")

    @field_validator("content")
    @classmethod
    def strip_content(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("content cannot be empty or whitespace-only")
        return s


# ------------------------------------------------------------------ #
# Request schemas
# ------------------------------------------------------------------ #


class ScheduledTaskCreate(BaseModel):
    """Create a new scheduled task."""

    name: str = Field(..., min_length=1, max_length=100, description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")

    schedule_type: str = Field(
        ...,
        description="调度类型: cron / interval / one_shot",
    )
    schedule_config: dict[str, Any] = Field(
        ...,
        description=(
            "调度配置。"
            "cron: {\"hour\": 2, \"minute\": 0}; "
            "interval: {\"minutes\": 30}; "
            "one_shot: {\"run_at\": \"2026-03-01T10:00:00\"}"
        ),
    )
    timezone: str = Field("UTC", description="时区，如 Asia/Shanghai")

    task_type: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="任务类型: send_message / run_agent / call_tool / 自定义",
    )
    task_params: dict[str, Any] = Field(
        default_factory=dict,
        description="传递给任务处理器的参数",
    )

    max_runs: Optional[int] = Field(
        None,
        ge=1,
        description="最大执行次数，达到后自动标记完成；不设置则无限执行",
    )

    @field_validator("schedule_type")
    @classmethod
    def validate_schedule_type(cls, v: str) -> str:
        allowed = {"cron", "interval", "one_shot"}
        if v not in allowed:
            raise ValueError(f"schedule_type 必须是 {allowed} 之一")
        return v


class ScheduledTaskUpdate(BaseModel):
    """Update an existing scheduled task.  All fields optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None

    schedule_type: Optional[str] = None
    schedule_config: Optional[dict[str, Any]] = None
    timezone: Optional[str] = None

    task_type: Optional[str] = Field(None, min_length=1, max_length=50)
    task_params: Optional[dict[str, Any]] = None

    max_runs: Optional[int] = Field(None, ge=1)

    @field_validator("schedule_type")
    @classmethod
    def validate_schedule_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"cron", "interval", "one_shot"}
            if v not in allowed:
                raise ValueError(f"schedule_type 必须是 {allowed} 之一")
        return v


# ------------------------------------------------------------------ #
# Response schemas
# ------------------------------------------------------------------ #


class ScheduledTaskResponse(BaseModel):
    """Single scheduled task."""

    id: UUID
    user_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None

    schedule_type: str
    schedule_config: dict[str, Any]
    timezone: str

    task_type: str
    task_params: dict[str, Any]

    status: str
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    last_run_error: Optional[str] = None
    next_run_at: Optional[datetime] = None
    run_count: int = 0
    max_runs: Optional[int] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScheduledTaskListResponse(BaseModel):
    """Paginated list of scheduled tasks."""

    tasks: list[ScheduledTaskResponse]
    total: int
