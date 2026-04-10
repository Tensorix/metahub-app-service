from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.model.activity import Activity
from app.db.model.activity_comment import ActivityComment
from app.service.activity import ActivityService


class CommentService:
    """Comment 服务类"""

    @staticmethod
    def create_comment(db: Session, activity_id: UUID, content: str, user_id: UUID) -> Optional[ActivityComment]:
        """创建评论（带用户隔离）"""
        activity = ActivityService.get_activity(db, activity_id, user_id)
        if not activity:
            return None

        normalized_content = content.strip()
        if not normalized_content:
            raise ValueError("评论内容不能为空")

        comment = ActivityComment(
            activity_id=activity_id,
            user_id=user_id,
            content=normalized_content,
        )
        db.add(comment)
        db.commit()
        db.refresh(comment)
        return comment

    @staticmethod
    def get_comment(db: Session, comment_id: UUID, user_id: UUID, include_deleted: bool = False) -> Optional[ActivityComment]:
        """根据ID获取评论（带用户隔离）"""
        query = db.query(ActivityComment).join(Activity).filter(
            ActivityComment.id == comment_id,
            Activity.user_id == user_id,
        )
        if not include_deleted:
            query = query.filter(
                ActivityComment.is_deleted == False,
                Activity.is_deleted == False,
            )
        return query.first()

    @staticmethod
    def get_comments(db: Session, activity_id: UUID, user_id: UUID, include_deleted: bool = False) -> list[ActivityComment]:
        """获取活动下的评论列表（带用户隔离）"""
        query = db.query(ActivityComment).join(Activity).filter(
            ActivityComment.activity_id == activity_id,
            Activity.user_id == user_id,
        )
        if not include_deleted:
            query = query.filter(
                ActivityComment.is_deleted == False,
                Activity.is_deleted == False,
            )
        return query.order_by(ActivityComment.created_at.asc()).all()

    @staticmethod
    def update_comment(db: Session, comment_id: UUID, content: str, user_id: UUID) -> Optional[ActivityComment]:
        """更新评论（带用户隔离）"""
        comment = CommentService.get_comment(db, comment_id, user_id)
        if not comment:
            return None

        normalized_content = content.strip()
        if not normalized_content:
            raise ValueError("评论内容不能为空")

        comment.content = normalized_content
        comment.version += 1
        db.commit()
        db.refresh(comment)
        return comment

    @staticmethod
    def delete_comment(db: Session, comment_id: UUID, user_id: UUID, soft_delete: bool = True) -> bool:
        """删除评论（带用户隔离）"""
        comment = CommentService.get_comment(db, comment_id, user_id)
        if not comment:
            return False

        if soft_delete:
            comment.is_deleted = True
            comment.version += 1
            db.commit()
        else:
            db.delete(comment)
            db.commit()

        return True

    @staticmethod
    def restore_comment(db: Session, comment_id: UUID, user_id: UUID) -> Optional[ActivityComment]:
        """恢复已删除的评论（带用户隔离）"""
        comment = CommentService.get_comment(db, comment_id, user_id, include_deleted=True)
        if not comment or not comment.is_deleted:
            return None

        comment.is_deleted = False
        comment.version += 1
        db.commit()
        db.refresh(comment)
        return comment
