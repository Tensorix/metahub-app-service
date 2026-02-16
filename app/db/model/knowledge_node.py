"""KnowledgeNode model — unified tree node for the knowledge base.

Node types:
- folder:   container, can enable vector_enabled (inherited by children)
- document: rich text / Markdown content
- dataset:  structured data table with schema_definition + DatasetRow children
"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
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

from app.db.model.base import Base

if TYPE_CHECKING:
    from app.db.model.dataset_row import DatasetRow
    from app.db.model.knowledge_embedding import KnowledgeEmbedding
    from app.db.model.user import User


class KnowledgeNode(Base):
    """Unified tree node for knowledge base — folder / document / dataset."""

    __tablename__ = "knowledge_node"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    parent_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("knowledge_node.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Parent node (null for root-level nodes)",
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Owner user",
    )
    name: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="Node name"
    )
    node_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="folder | document | dataset",
    )

    # --- folder fields ---
    vector_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default="false",
        comment="Enable vectorization (folder only, inherited by descendants)",
    )

    # --- document fields ---
    content: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Rich text / Markdown content (document only)",
    )

    # --- dataset fields ---
    schema_definition: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Column definitions for datasets (dataset only)",
    )

    # --- common fields ---
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Node description"
    )
    icon: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="Emoji or icon identifier"
    )
    position: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        server_default="0",
        comment="Sort order within parent",
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
        comment="Extra metadata / tags",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default="false",
        comment="Soft delete flag",
    )

    # --- relationships ---
    parent: Mapped[Optional["KnowledgeNode"]] = relationship(
        "KnowledgeNode",
        remote_side="KnowledgeNode.id",
        back_populates="children",
    )
    children: Mapped[list["KnowledgeNode"]] = relationship(
        "KnowledgeNode",
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="noload",
        order_by="KnowledgeNode.position, KnowledgeNode.name",
    )
    rows: Mapped[list["DatasetRow"]] = relationship(
        "DatasetRow",
        back_populates="dataset",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    embeddings: Mapped[list["KnowledgeEmbedding"]] = relationship(
        "KnowledgeEmbedding",
        back_populates="node",
        cascade="all, delete-orphan",
        lazy="noload",
        foreign_keys="KnowledgeEmbedding.node_id",
    )
