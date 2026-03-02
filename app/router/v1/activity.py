from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from math import ceil

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.service.activity import ActivityService
from app.service.activity_relation_service import ActivityRelationService
from app.schema.activity import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
    ActivityListQuery,
    ActivityListResponse,
    ActivityReorderRequest,
    RelationInfo,
)

router = APIRouter(prefix="/activities", tags=["activities"])


def _build_activity_response(activity, db: Session, user_id) -> ActivityResponse:
    """构建带解析后 relations 的 ActivityResponse"""
    rels = [r for r in (activity.relations or []) if not r.is_deleted]
    resolved = ActivityRelationService.resolve_relations(db, user_id, rels)
    return ActivityResponse.from_activity(
        activity,
        [RelationInfo.model_validate(r) for r in resolved],
    )


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED, summary="创建活动")
def create_activity(
    activity_data: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建新的活动"""
    try:
        activity = ActivityService.create_activity(db, activity_data, current_user.id)
        return _build_activity_response(activity, db, current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建活动失败: {str(e)}")


@router.patch("/reorder", status_code=status.HTTP_200_OK, summary="批量更新活动排序")
def reorder_activities(
    reorder_data: ActivityReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """批量更新活动的排序顺序，传入按期望顺序排列的活动ID列表"""
    try:
        ActivityService.reorder_activities(db, reorder_data.ordered_ids, current_user.id)
        return {"message": "排序已更新"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新排序失败: {str(e)}")


@router.get("/{activity_id}", response_model=ActivityResponse, summary="获取活动详情")
def get_activity(
    activity_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """根据ID获取活动详情"""
    activity = ActivityService.get_activity(db, activity_id, current_user.id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    return _build_activity_response(activity, db, current_user.id)


@router.get("", response_model=ActivityListResponse, summary="获取活动列表")
def get_activities(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量"),
    type: Optional[str] = Query(None, description="按类型筛选"),
    priority_min: Optional[int] = Query(None, description="最小优先级"),
    priority_max: Optional[int] = Query(None, description="最大优先级"),
    tags: Optional[list[str]] = Query(None, description="按标签筛选（数组，匹配任意标签）"),
    is_deleted: bool = Query(False, description="是否包含已删除的记录"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取活动列表，支持分页和筛选"""
    query_params = ActivityListQuery(
        page=page,
        size=size,
        type=type,
        priority_min=priority_min,
        priority_max=priority_max,
        tags=tags,
        is_deleted=is_deleted
    )

    activities, total = ActivityService.get_activities(db, query_params, current_user.id)
    pages = ceil(total / size) if total > 0 else 0

    return ActivityListResponse(
        items=[_build_activity_response(a, db, current_user.id) for a in activities],
        total=total,
        page=page,
        size=size,
        pages=pages
    )


@router.put("/{activity_id}", response_model=ActivityResponse, summary="更新活动")
def update_activity(
    activity_id: UUID,
    activity_data: ActivityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新活动信息"""
    activity = ActivityService.update_activity(db, activity_id, activity_data, current_user.id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在")
    return _build_activity_response(activity, db, current_user.id)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除活动")
def delete_activity(
    activity_id: UUID,
    hard_delete: bool = Query(False, description="是否硬删除"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除活动（默认软删除）"""
    success = ActivityService.delete_activity(db, activity_id, current_user.id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="活动不存在")


@router.post("/{activity_id}/restore", response_model=ActivityResponse, summary="恢复已删除的活动")
def restore_activity(
    activity_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """恢复已删除的活动"""
    activity = ActivityService.restore_activity(db, activity_id, current_user.id)
    if not activity:
        raise HTTPException(status_code=404, detail="活动不存在或未被删除")
    return _build_activity_response(activity, db, current_user.id)