from app.db.model import Base
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.db.model.activity_relation import ActivityRelation


class Activity(Base):
    __tablename__ = "activity"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属用户ID"
    )
    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, comment="版本号，每次更新递增"
    )
    type: Mapped[str] = mapped_column(String(100), nullable=False, comment="活动类型")
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="活动名称")
    priority: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="优先级，数字越大优先级越高"
    )
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="备注")
    tags: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(String(100)),
        nullable=True,
        default=list,
        server_default=text("ARRAY[]::VARCHAR[]"),
        comment="标签列表",
    )
    source_type: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="来源类型，如 manual/event/topic"
    )
    source_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="来源ID"
    )
    relation_ids: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(String(255)),
        nullable=True,
        default=list,
        server_default=text("ARRAY[]::VARCHAR[]"),
        comment="关联ID列表",
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, comment="状态: pending/active/done/dismissed"
    )
    remind_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="提醒时间"
    )
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="截止日期"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
        comment="更新时间"
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否删除"
    )

    # Relationships
    relations: Mapped[list["ActivityRelation"]] = relationship(
        "ActivityRelation",
        back_populates="activity",
        foreign_keys="ActivityRelation.activity_id",
        lazy="selectin",
    )