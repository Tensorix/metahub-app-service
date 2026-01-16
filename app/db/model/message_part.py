from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship


class MessagePart(Base):
    """消息部分表 - 支持多模态消息"""
    __tablename__ = "message_part"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("message.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属消息ID"
    )
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="内容类型: text/plain/image/url/json"
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False, comment="内容: string/jsonstr/base64/url"
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True, comment="扩展元数据"
    )
    event_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="关联事件ID"
    )
    raw_data: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, comment="原始数据"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间"
    )

    # Relationships
    message: Mapped["Message"] = relationship("Message", back_populates="parts")
