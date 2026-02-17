"""add knowledge vectorization_config and embedding parent_id

Revision ID: b8c7d6e5f4a3
Revises: 80309be37472
Create Date: 2026-02-17

Add vectorization_config to knowledge_node (folder-level vectorization settings)
and parent_id to knowledge_embedding (for parent-child chunk mode).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c7d6e5f4a3"
down_revision: Union[str, Sequence[str], None] = "4af2c9612823"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.add_column(
        "knowledge_node",
        sa.Column(
            "vectorization_config",
            sa.dialects.postgresql.JSONB(),
            nullable=True,
            comment="Vectorization settings (folder only)",
        ),
    )
    op.add_column(
        "knowledge_embedding",
        sa.Column(
            "parent_id",
            sa.UUID(),
            sa.ForeignKey("knowledge_embedding.id", ondelete="CASCADE"),
            nullable=True,
            comment="Parent chunk ID (for parent-child mode)",
        ),
    )
    op.create_index("idx_ke_parent", "knowledge_embedding", ["parent_id"], unique=False)
    op.execute("""
        CREATE INDEX idx_ke_chunk_text_trgm
        ON knowledge_embedding
        USING GIN (chunk_text gin_trgm_ops)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_ke_chunk_text_trgm")
    op.drop_index("idx_ke_parent", table_name="knowledge_embedding")
    op.drop_column("knowledge_embedding", "parent_id")
    op.drop_column("knowledge_node", "vectorization_config")
