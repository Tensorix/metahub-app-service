from app.db.model import Base
from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column


class ActivityRelation(Base):
    __tablename__ = "activity_relation"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    activity_id: Mapped[UUID] = mapped_column(
        ForeignKey("activity.id"), nullable=False, comment="关联的活动ID"
    )
    target_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="目标类型"
    )
    target_id: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="目标ID"
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
