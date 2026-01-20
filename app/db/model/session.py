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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Session(Base):
    """会话表 - 支持私聊、群聊、AI对话等"""
    __tablename__ = "session"

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
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="会话名称")
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="会话类型: pm/group/ai/<plugin_type>"
    )
    agent_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("agent.id", ondelete="SET NULL"),
        nullable=True,
        comment="关联的 Agent ID"
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True, comment="扩展元数据"
    )
    source: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="来源: null/astr_wechat/astr_qq/manual_upload"
    )
    last_visited_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="最后访问时间，用于已读未读"
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
    topics: Mapped[list["Topic"]] = relationship("Topic", back_populates="session", lazy="dynamic")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="session", lazy="dynamic")
    agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="sessions")
