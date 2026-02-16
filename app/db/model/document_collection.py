"""DocumentCollection model — user-level document collections (structured or unstructured)."""

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
    from app.db.model.document import Document
    from app.db.model.user import User


class DocumentCollection(Base):
    """Document collection — container for documents (Notion Database / Airtable Table style).

    type: "structured" | "unstructured"
    schema_definition: only for structured, stores user-defined field definitions (JSONB)
    vector_enabled: opt-in vectorization, default False
    """

    __tablename__ = "document_collection"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Owner user",
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="Collection name")
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Collection description"
    )
    type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="structured | unstructured",
    )
    schema_definition: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Field definitions for structured collections only",
    )
    vector_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default="false",
        comment="Whether vector search is enabled (opt-in)",
    )
    settings: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Extra settings (chunk size, etc.)",
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
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        back_populates="collection",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
