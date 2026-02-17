# app/router/v1/scheduled_task.py

"""Scheduled task API endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.schema.scheduled_task import (
    ScheduledTaskCreate,
    ScheduledTaskUpdate,
    ScheduledTaskResponse,
    ScheduledTaskListResponse,
)
from app.service.scheduled_task import ScheduledTaskService


router = APIRouter(prefix="/scheduled-tasks", tags=["Scheduled Tasks"])


# ------------------------------------------------------------------ #
# CRUD
# ------------------------------------------------------------------ #


@router.post(
    "",
    response_model=ScheduledTaskResponse,
    status_code=201,
    summary="创建定时任务",
)
def create_task(
    body: ScheduledTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建一个新的定时任务并立即注册到调度器。"""
    task = ScheduledTaskService.create_task(db, current_user.id, body)
    return ScheduledTaskResponse.model_validate(task)


@router.get(
    "",
    response_model=ScheduledTaskListResponse,
    summary="获取定时任务列表",
)
def list_tasks(
    status: Optional[str] = Query(None, description="按状态过滤: active/paused/completed/expired"),
    task_type: Optional[str] = Query(None, description="按任务类型过滤"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的定时任务列表。"""
    tasks, total = ScheduledTaskService.list_tasks(
        db, current_user.id,
        status=status,
        task_type=task_type,
        limit=limit,
        offset=offset,
    )
    return ScheduledTaskListResponse(
        tasks=[ScheduledTaskResponse.model_validate(t) for t in tasks],
        total=total,
    )


@router.get(
    "/{task_id}",
    response_model=ScheduledTaskResponse,
    summary="获取定时任务详情",
)
def get_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取指定定时任务的详情。"""
    task = ScheduledTaskService.get_task(db, task_id, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    return ScheduledTaskResponse.model_validate(task)


@router.put(
    "/{task_id}",
    response_model=ScheduledTaskResponse,
    summary="更新定时任务",
)
def update_task(
    task_id: UUID,
    body: ScheduledTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新定时任务的调度配置或任务参数。"""
    task = ScheduledTaskService.update_task(db, task_id, current_user.id, body)
    if task is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    return ScheduledTaskResponse.model_validate(task)


@router.delete(
    "/{task_id}",
    status_code=204,
    summary="删除定时任务",
)
def delete_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除定时任务，同时从调度器中移除。"""
    deleted = ScheduledTaskService.delete_task(db, task_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="定时任务不存在")


# ------------------------------------------------------------------ #
# Actions
# ------------------------------------------------------------------ #


@router.post(
    "/{task_id}/pause",
    response_model=ScheduledTaskResponse,
    summary="暂停定时任务",
)
def pause_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """暂停一个处于 active 状态的定时任务。"""
    task = ScheduledTaskService.pause_task(db, task_id, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    return ScheduledTaskResponse.model_validate(task)


@router.post(
    "/{task_id}/resume",
    response_model=ScheduledTaskResponse,
    summary="恢复定时任务",
)
def resume_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """恢复一个处于 paused 状态的定时任务。"""
    task = ScheduledTaskService.resume_task(db, task_id, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    return ScheduledTaskResponse.model_validate(task)


@router.post(
    "/{task_id}/trigger",
    response_model=ScheduledTaskResponse,
    summary="手动触发一次",
)
async def trigger_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """立即手动触发一次任务执行（不影响原有调度计划）。"""
    task = await ScheduledTaskService.trigger_task(db, task_id, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    return ScheduledTaskResponse.model_validate(task)
