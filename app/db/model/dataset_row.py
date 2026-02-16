"""DatasetRow model — a single row in a dataset (structured data table)."""

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base

if TYPE_CHECKING:
    from app.db.model.knowledge_embedding import KnowledgeEmbedding
    from app.db.model.knowledge_node import KnowledgeNode


class DatasetRow(Base):
    """Single row in a dataset node — structured KV data conforming to schema."""

    __tablename__ = "dataset_row"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    dataset_id: Mapped[UUID] = mapped_column(
        ForeignKey("knowledge_node.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Parent dataset node",
    )
    data: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default="'{}'",
        comment="Row data conforming to dataset schema",
    )
    position: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        server_default="0",
        comment="Row order",
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
    dataset: Mapped["KnowledgeNode"] = relationship(
        "KnowledgeNode",
        back_populates="rows",
    )
    embeddings: Mapped[list["KnowledgeEmbedding"]] = relationship(
        "KnowledgeEmbedding",
        back_populates="row",
        cascade="all, delete-orphan",
        lazy="noload",
        foreign_keys="KnowledgeEmbedding.row_id",
    )
