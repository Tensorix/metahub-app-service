from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Topic(Base):
    """话题表 - 会话内的话题分组"""
    __tablename__ = "topic"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="话题名称")
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属会话ID"
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
    session: Mapped["Session"] = relationship("Session", back_populates="topics")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="topic", lazy="dynamic")
