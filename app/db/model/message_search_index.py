"""MessageSearchIndex model — text + metadata for message search.

Embedding vectors are stored in the separate `message_embedding` table
so that models can be swapped without touching the index rows.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base


class MessageSearchIndex(Base):
    """搜索索引表 — 存储可搜索文本与元数据，不含 embedding"""

    __tablename__ = "message_search_index"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("message.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        comment="关联消息ID",
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属用户ID（反范式，权限隔离）",
    )
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属会话ID（反范式）",
    )
    session_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="会话类型快照: pm/group/ai"
    )
    session_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="会话名称快照"
    )
    topic_id: Mapped[Optional[UUID]] = mapped_column(
        nullable=True, comment="话题ID（用于上下文检索）"
    )
    sender_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="发送者名称快照"
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="消息角色: user/assistant/system"
    )
    message_created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, comment="原始消息创建时间"
    )
    content_text: Mapped[str] = mapped_column(
        Text, nullable=False, comment="拼接后的可搜索文本"
    )
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="索引写入时间",
    )

    # Relationships
    embedding: Mapped[Optional["MessageEmbedding"]] = relationship(
        "MessageEmbedding",
        back_populates="search_index",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        # pg_trgm GIN index for fuzzy text search
        Index(
            "idx_search_content_trgm",
            "content_text",
            postgresql_using="gin",
            postgresql_ops={"content_text": "gin_trgm_ops"},
        ),
        # Filter indexes
        Index("idx_search_user_session_type", "user_id", "session_type"),
        Index("idx_search_session", "session_id"),
        Index(
            "idx_search_topic",
            "topic_id",
            postgresql_where=text("topic_id IS NOT NULL"),
        )
        if False
        else Index("idx_search_topic", "topic_id"),
        Index("idx_search_session_created", "session_id", "message_created_at"),
        Index("idx_search_user_created", "user_id", "message_created_at"),
        # pg_trgm on sender_name and session_name for ILIKE filters
        Index(
            "idx_search_sender_trgm",
            "sender_name",
            postgresql_using="gin",
            postgresql_ops={"sender_name": "gin_trgm_ops"},
        ),
        Index(
            "idx_search_session_name_trgm",
            "session_name",
            postgresql_using="gin",
            postgresql_ops={"session_name": "gin_trgm_ops"},
        ),
    )


# Avoid circular import — model is in same package
from app.db.model.message_embedding import MessageEmbedding  # noqa: E402, F401
