"""DocumentEmbedding model — vector storage for document chunks."""

from datetime import datetime
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


class DocumentEmbedding(Base):
    """Vector embedding for a document chunk.

    When vector_enabled on collection, documents get chunked (unstructured)
    or serialized to text (structured) and embedded.
    """

    __tablename__ = "document_embedding"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("document.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Parent document",
    )
    model_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Embedding model ID",
    )
    embedding: Mapped[list] = mapped_column(
        HALFVEC(),
        nullable=False,
        comment="halfvec vector",
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Chunk order index",
    )
    chunk_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Original chunk text",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="completed",
        server_default="completed",
        comment="pending/completed/failed",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Created at",
    )

    # Relationships
    document: Mapped["Document"] = relationship(
        "Document",
        back_populates="embeddings",
    )

    __table_args__ = (
        Index("idx_doc_embedding_document", "document_id"),
        Index("idx_doc_embedding_model", "model_id"),
        Index(
            "idx_doc_embedding_model_status",
            "model_id",
            "status",
            postgresql_where="status = 'completed'",
        ),
    )
