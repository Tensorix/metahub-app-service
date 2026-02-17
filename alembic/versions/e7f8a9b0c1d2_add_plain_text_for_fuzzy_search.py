"""add plain_text columns for fuzzy search without embedding

Revision ID: e7f8a9b0c1d2
Revises: 6faf8de6764a
Create Date: 2026-02-17

Add content_plain_text to knowledge_node and data_plain_text to dataset_row
for direct fuzzy search without requiring vectorization.
"""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text as sa_text


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "6faf8de6764a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _extract_text_from_tiptap(content: str) -> str:
    """Extract plain text from TipTap JSON (mirrors app.service.knowledge)."""
    if not content or not content.strip():
        return ""
    text = content.strip()
    if not text.startswith("{"):
        return text
    try:
        doc = json.loads(content)
        if not isinstance(doc, dict) or doc.get("type") != "doc":
            return text
        texts: list[str] = []

        def walk(nodes: list) -> None:
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                if node.get("type") == "text":
                    t = node.get("text")
                    if isinstance(t, str):
                        texts.append(t)
                if "content" in node and isinstance(node["content"], list):
                    walk(node["content"])

        walk(doc.get("content") or [])
        return "\n".join(texts) if texts else text
    except (json.JSONDecodeError, TypeError):
        return text


def _serialize_row_data(data: dict) -> str:
    """Serialize row data to text (mirrors app.service.knowledge)."""
    if not data:
        return ""
    parts = [f"{k}: {v}" for k, v in data.items() if v is not None]
    return " | ".join(parts)


def upgrade() -> None:
    op.add_column(
        "knowledge_node",
        sa.Column(
            "content_plain_text",
            sa.Text(),
            nullable=True,
            comment="Plain text extracted from TipTap content for fuzzy search",
        ),
    )
    op.add_column(
        "dataset_row",
        sa.Column(
            "data_plain_text",
            sa.Text(),
            nullable=True,
            comment="Serialized row data for fuzzy search",
        ),
    )
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("""
        CREATE INDEX idx_kn_content_plain_trgm
        ON knowledge_node
        USING GIN (content_plain_text gin_trgm_ops)
        WHERE content_plain_text IS NOT NULL AND length(content_plain_text) >= 2
    """)
    op.execute("""
        CREATE INDEX idx_dr_data_plain_trgm
        ON dataset_row
        USING GIN (data_plain_text gin_trgm_ops)
        WHERE data_plain_text IS NOT NULL AND length(data_plain_text) >= 2
    """)

    conn = op.get_bind()
    for row in conn.execute(
        sa_text(
            "SELECT id, content FROM knowledge_node "
            "WHERE node_type = 'document' AND content IS NOT NULL AND is_deleted = false"
        )
    ):
        plain = _extract_text_from_tiptap(row.content or "")
        if plain:
            conn.execute(
                sa_text("UPDATE knowledge_node SET content_plain_text = :pt WHERE id = :id"),
                {"pt": plain, "id": row.id},
            )

    for row in conn.execute(
        sa_text(
            "SELECT id, data FROM dataset_row WHERE is_deleted = false AND data IS NOT NULL"
        )
    ):
        data = row.data if isinstance(row.data, dict) else json.loads(row.data or "{}")
        plain = _serialize_row_data(data)
        if plain:
            conn.execute(
                sa_text("UPDATE dataset_row SET data_plain_text = :pt WHERE id = :id"),
                {"pt": plain, "id": row.id},
            )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_dr_data_plain_trgm")
    op.execute("DROP INDEX IF EXISTS idx_kn_content_plain_trgm")
    op.drop_column("dataset_row", "data_plain_text")
    op.drop_column("knowledge_node", "content_plain_text")
