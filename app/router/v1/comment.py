from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.model.user import User
from app.db.session import get_db
from app.deps import get_current_user
from app.schema.comment import CommentCreate, CommentResponse, CommentUpdate
from app.service.comment import CommentService

router = APIRouter(tags=["comments"])


@router.get("/activities/{activity_id}/comments", response_model=list[CommentResponse], summary="获取活动评论列表")
def get_activity_comments(
    activity_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comments = CommentService.get_comments(db, activity_id, current_user.id)
    return [CommentResponse.model_validate(comment) for comment in comments]


@router.post(
    "/activities/{activity_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建活动评论",
)
def create_activity_comment(
    activity_id: UUID,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        comment = CommentService.create_comment(db, activity_id, data.content, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not comment:
        raise HTTPException(status_code=404, detail="活动不存在")
    return CommentResponse.model_validate(comment)


@router.get("/comments/{comment_id}", response_model=CommentResponse, summary="获取评论详情")
def get_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = CommentService.get_comment(db, comment_id, current_user.id)
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    return CommentResponse.model_validate(comment)


@router.put("/comments/{comment_id}", response_model=CommentResponse, summary="更新评论")
def update_comment(
    comment_id: UUID,
    data: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        comment = CommentService.update_comment(db, comment_id, data.content, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    return CommentResponse.model_validate(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除评论")
def delete_comment(
    comment_id: UUID,
    hard_delete: bool = Query(False, description="是否硬删除"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    success = CommentService.delete_comment(db, comment_id, current_user.id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="评论不存在")


@router.post("/comments/{comment_id}/restore", response_model=CommentResponse, summary="恢复已删除的评论")
def restore_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = CommentService.restore_comment(db, comment_id, current_user.id)
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在或未被删除")
    return CommentResponse.model_validate(comment)
