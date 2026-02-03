"""MessageEmbedding model — single table, multi-model vector storage.

Uses halfvec (no fixed dimensions) so different models can coexist.
Each model gets its own HNSW partial index via Alembic migrations.
"""

from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base

# pgvector integration — HALFVEC column with no dimension constraint
from pgvector.sqlalchemy import HALFVEC


class MessageEmbedding(Base):
    """向量存储表 — halfvec 不指定维度，配合表达式部分索引实现多模型 HNSW"""

    __tablename__ = "message_embedding"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    search_index_id: Mapped[UUID] = mapped_column(
        ForeignKey("message_search_index.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        comment="关联搜索索引记录",
    )
    model_id: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="生成此 embedding 的模型ID"
    )
    embedding: Mapped[list] = mapped_column(
        HALFVEC(), nullable=False, comment="halfvec 向量（无维度限制）"
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
        comment="状态: pending/completed/failed",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="创建时间",
    )

    # Relationships
    search_index: Mapped["MessageSearchIndex"] = relationship(
        "MessageSearchIndex", back_populates="embedding"
    )

    __table_args__ = (
        Index("idx_msg_embedding_model", "model_id"),
        Index(
            "idx_msg_embedding_status",
            "status",
            postgresql_where="status != 'completed'",
        ),
    )


from app.db.model.message_search_index import MessageSearchIndex  # noqa: E402, F401
