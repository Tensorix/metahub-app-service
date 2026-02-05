# app/schema/background_task.py

"""Background task API schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BackgroundTaskResponse(BaseModel):
    """Background task response."""
    
    id: UUID
    task_type: str
    status: str
    session_id: Optional[UUID] = None
    
    total_items: int = 0
    processed_items: int = 0
    failed_items: int = 0
    progress_percent: float = 0.0
    
    result: Optional[str] = None
    error: Optional[str] = None
    
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class BackgroundTaskListResponse(BaseModel):
    """List of background tasks."""
    
    tasks: list[BackgroundTaskResponse]
    total: int


class StartIndexTaskRequest(BaseModel):
    """Request to start indexing task."""
    
    session_id: UUID
    skip_embedding: bool = Field(
        default=False,
        description="是否跳过 embedding 生成（只创建文本索引）"
    )


class StartBackfillTaskRequest(BaseModel):
    """Request to start embedding backfill task."""
    
    session_id: Optional[UUID] = Field(
        default=None,
        description="限制到特定会话，不提供则处理所有会话"
    )
    batch_size: int = Field(
        default=100,
        ge=10,
        le=500,
        description="每批处理数量"
    )


class StartReindexTaskRequest(BaseModel):
    """Request to start reindex task."""
    
    session_id: UUID
    skip_embedding: bool = Field(
        default=False,
        description="是否跳过 embedding 生成"
    )


class TaskStartedResponse(BaseModel):
    """Response when a task is started."""
    
    task_id: UUID
    task_type: str
    status: str = "pending"
    message: str = "任务已创建，正在后台执行"


class CancelTaskResponse(BaseModel):
    """Response when cancelling a task."""
    
    success: bool
    message: str
