from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid7

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base

if TYPE_CHECKING:
    from app.db.model.activity import Activity


class ActivityComment(Base):
    __tablename__ = "activity_comment"
    __table_args__ = (
        Index("ix_activity_comment_activity_id_created_at", "activity_id", "created_at"),
        Index("ix_activity_comment_user_id", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    activity_id: Mapped[UUID] = mapped_column(
        ForeignKey("activity.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属活动ID",
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属用户ID",
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="评论内容")
    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, server_default=text("1"), comment="版本号，每次更新递增"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
        comment="更新时间",
    )
    is_deleted: Mapped[bool] = mapped_column(
        nullable=False,
        default=False,
        server_default=text("false"),
        comment="是否删除",
    )

    activity: Mapped["Activity"] = relationship(
        "Activity",
        back_populates="activity_comments",
        lazy="selectin",
    )
