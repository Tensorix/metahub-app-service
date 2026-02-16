"""KnowledgeEmbedding model — vector storage for knowledge base content."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base

from pgvector.sqlalchemy import HALFVEC

if TYPE_CHECKING:
    from app.db.model.dataset_row import DatasetRow
    from app.db.model.knowledge_node import KnowledgeNode


class KnowledgeEmbedding(Base):
    """Vector embedding for a chunk of knowledge content.

    Can reference either a KnowledgeNode (document content) or a DatasetRow.
    """

    __tablename__ = "knowledge_embedding"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    node_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("knowledge_node.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Source document node (for document content)",
    )
    row_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("dataset_row.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Source dataset row (for structured data)",
    )
    model_id: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="Embedding model ID"
    )
    embedding: Mapped[list] = mapped_column(
        HALFVEC(), nullable=False, comment="halfvec vector"
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="Chunk order index"
    )
    chunk_text: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Original chunk text"
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="completed",
        server_default="completed",
        comment="pending / completed / failed",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # --- relationships ---
    node: Mapped[Optional["KnowledgeNode"]] = relationship(
        "KnowledgeNode",
        back_populates="embeddings",
        foreign_keys=[node_id],
    )
    row: Mapped[Optional["DatasetRow"]] = relationship(
        "DatasetRow",
        back_populates="embeddings",
        foreign_keys=[row_id],
    )

    __table_args__ = (
        Index("idx_ke_node", "node_id"),
        Index("idx_ke_row", "row_id"),
        Index("idx_ke_model", "model_id"),
        Index(
            "idx_ke_model_status",
            "model_id",
            "status",
            postgresql_where="status = 'completed'",
        ),
    )
