from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class MessageSender(Base):
    """消息发送者表"""
    __tablename__ = "message_sender"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="发送者名称")
    external_id: Mapped[Optional[str]] = mapped_column(
        String(255), 
        nullable=True, 
        index=True,
        comment="外部系统的唯一标识符（如QQ UID、Webhook sender_id等）"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间"
    )

    # Relationships
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="sender")
