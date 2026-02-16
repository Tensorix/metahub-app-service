"""Document model — individual document within a collection."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base

if TYPE_CHECKING:
    from app.db.model.document_collection import DocumentCollection
    from app.db.model.document_embedding import DocumentEmbedding


class Document(Base):
    """Document — single document in a collection.

    For unstructured: content (TEXT) holds Markdown/plain text.
    For structured: data (JSONB) holds key-value pairs conforming to collection schema.
    """

    __tablename__ = "document"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    collection_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_collection.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Parent collection",
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False, comment="Document title")
    content: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Unstructured content (Markdown/plain text)",
    )
    data: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Structured data (conforming to collection schema)",
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
        comment="Labels, tags, custom attributes",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="Created at",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
        comment="Updated at",
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default="false",
        comment="Soft delete",
    )

    # Relationships
    collection: Mapped["DocumentCollection"] = relationship(
        "DocumentCollection",
        back_populates="documents",
    )
    embeddings: Mapped[list["DocumentEmbedding"]] = relationship(
        "DocumentEmbedding",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="noload",
    )
