from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Message(Base):
    """消息表"""
    __tablename__ = "message"

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
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属会话ID"
    )
    topic_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("topic.id", ondelete="SET NULL"),
        nullable=True,
        comment="所属话题ID"
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="角色: user/assistant/system/self/null"
    )
    sender_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("message_sender.id", ondelete="SET NULL"),
        nullable=True,
        comment="发送者ID"
    )
    external_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True, comment="外部系统的消息ID"
    )
    message_str: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="消息纯文本内容，由 parts 合成，用于检索和统一处理"
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
    session: Mapped["Session"] = relationship("Session", back_populates="messages")
    topic: Mapped[Optional["Topic"]] = relationship("Topic", back_populates="messages")
    sender: Mapped[Optional["MessageSender"]] = relationship("MessageSender", back_populates="messages")
    parts: Mapped[list["MessagePart"]] = relationship(
        "MessagePart", back_populates="message", cascade="all, delete-orphan"
    )
