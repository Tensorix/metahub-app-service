# app/router/v1/background_task.py

"""Background task API endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.db.model.session import Session as SessionModel
from app.deps import get_current_user
from app.schema.background_task import (
    BackgroundTaskResponse,
    BackgroundTaskListResponse,
    StartIndexTaskRequest,
    StartBackfillTaskRequest,
    StartReindexTaskRequest,
    TaskStartedResponse,
    CancelTaskResponse,
)
from app.service.background_task import (
    BackgroundTaskService,
    run_task_in_background,
    execute_index_session_task,
    execute_backfill_embeddings_task,
    execute_reindex_session_task,
)


router = APIRouter(prefix="/background-tasks", tags=["Background Tasks"])


@router.get(
    "",
    response_model=BackgroundTaskListResponse,
    summary="获取后台任务列表",
)
def list_tasks(
    status: Optional[str] = Query(None, description="按状态过滤: pending/running/completed/failed/cancelled"),
    task_type: Optional[str] = Query(None, description="按任务类型过滤"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的后台任务列表"""
    tasks = BackgroundTaskService.get_user_tasks(
        db, current_user.id, status=status, task_type=task_type, limit=limit
    )
    return BackgroundTaskListResponse(
        tasks=[_task_to_response(t) for t in tasks],
        total=len(tasks),
    )


@router.get(
    "/{task_id}",
    response_model=BackgroundTaskResponse,
    summary="获取任务详情",
)
def get_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取指定任务的详情"""
    task = BackgroundTaskService.get_task(db, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    return _task_to_response(task)


@router.post(
    "/{task_id}/cancel",
    response_model=CancelTaskResponse,
    summary="取消任务",
)
def cancel_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取消正在执行或等待中的任务"""
    success = BackgroundTaskService.cancel_task(db, task_id, current_user.id)
    if success:
        return CancelTaskResponse(success=True, message="任务已取消")
    return CancelTaskResponse(success=False, message="无法取消任务（可能已完成或不存在）")


@router.post(
    "/index-session",
    response_model=TaskStartedResponse,
    summary="创建索引任务",
    description="为指定会话的消息创建搜索索引（后台执行）",
)
def start_index_task(
    request: StartIndexTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建会话索引任务"""
    # 验证会话存在且属于当前用户
    session = db.query(SessionModel).filter(
        SessionModel.id == request.session_id,
        SessionModel.user_id == current_user.id,
        SessionModel.is_deleted == False,
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    if session.type not in ("pm", "group"):
        raise HTTPException(status_code=400, detail="只有私聊和群聊类型的会话支持搜索索引")
    
    # 创建任务
    task = BackgroundTaskService.create_task(
        db=db,
        user_id=current_user.id,
        task_type="index_session",
        session_id=request.session_id,
        params={
            "skip_embedding": request.skip_embedding,
        },
    )
    
    # 提交到后台执行
    run_task_in_background(
        execute_index_session_task,
        task.id,
        user_id=current_user.id,
        session_id=request.session_id,
        skip_embedding=request.skip_embedding,
    )
    
    return TaskStartedResponse(
        task_id=task.id,
        task_type=task.task_type,
        status=task.status,
        message="索引任务已创建，正在后台执行",
    )


@router.post(
    "/backfill-embeddings",
    response_model=TaskStartedResponse,
    summary="创建 embedding 补建任务",
    description="为没有 embedding 的搜索索引生成向量（后台执行）",
)
def start_backfill_task(
    request: StartBackfillTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建 embedding 补建任务"""
    # 如果指定了会话，验证它存在
    if request.session_id:
        session = db.query(SessionModel).filter(
            SessionModel.id == request.session_id,
            SessionModel.user_id == current_user.id,
            SessionModel.is_deleted == False,
        ).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
    
    # 创建任务
    task = BackgroundTaskService.create_task(
        db=db,
        user_id=current_user.id,
        task_type="backfill_embeddings",
        session_id=request.session_id,
        params={
            "batch_size": request.batch_size,
        },
    )
    
    # 提交到后台执行
    run_task_in_background(
        execute_backfill_embeddings_task,
        task.id,
        user_id=current_user.id,
        session_id=request.session_id,
        batch_size=request.batch_size,
    )
    
    return TaskStartedResponse(
        task_id=task.id,
        task_type=task.task_type,
        status=task.status,
        message="Embedding 补建任务已创建，正在后台执行",
    )


@router.post(
    "/reindex-session",
    response_model=TaskStartedResponse,
    summary="创建重建索引任务",
    description="重建指定会话的搜索索引（后台执行）",
)
def start_reindex_task(
    request: StartReindexTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建重建索引任务"""
    # 验证会话存在且属于当前用户
    session = db.query(SessionModel).filter(
        SessionModel.id == request.session_id,
        SessionModel.user_id == current_user.id,
        SessionModel.is_deleted == False,
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    if session.type not in ("pm", "group"):
        raise HTTPException(status_code=400, detail="只有私聊和群聊类型的会话支持搜索索引")
    
    # 创建任务
    task = BackgroundTaskService.create_task(
        db=db,
        user_id=current_user.id,
        task_type="reindex_session",
        session_id=request.session_id,
        params={
            "skip_embedding": request.skip_embedding,
        },
    )
    
    # 提交到后台执行
    run_task_in_background(
        execute_reindex_session_task,
        task.id,
        user_id=current_user.id,
        session_id=request.session_id,
        skip_embedding=request.skip_embedding,
    )
    
    return TaskStartedResponse(
        task_id=task.id,
        task_type=task.task_type,
        status=task.status,
        message="重建索引任务已创建，正在后台执行",
    )


@router.get(
    "/session/{session_id}",
    response_model=BackgroundTaskListResponse,
    summary="获取会话的后台任务",
)
def get_session_tasks(
    session_id: UUID,
    status: Optional[str] = Query(None, description="按状态过滤"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取指定会话的后台任务列表"""
    tasks = BackgroundTaskService.get_session_tasks(
        db, session_id, current_user.id, status=status
    )
    return BackgroundTaskListResponse(
        tasks=[_task_to_response(t) for t in tasks],
        total=len(tasks),
    )


def _task_to_response(task) -> BackgroundTaskResponse:
    """Convert task model to response."""
    return BackgroundTaskResponse(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        session_id=task.session_id,
        total_items=task.total_items,
        processed_items=task.processed_items,
        failed_items=task.failed_items,
        progress_percent=task.progress_percent,
        result=task.result,
        error=task.error,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
    )
