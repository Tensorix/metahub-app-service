"""Add knowledge base tables (knowledge_node, dataset_row, knowledge_embedding)

Revision ID: a1b2c3d4e5f7
Revises: 8070721d443f
Create Date: 2026-02-17

Knowledge base module: tree-structured user-level knowledge storage
with folders, documents (rich text), datasets (structured tables),
and optional vector search.
"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import HALFVEC


revision = "a1b2c3d4e5f7"
down_revision = "8070721d443f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # knowledge_node — unified tree node
    op.create_table(
        "knowledge_node",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "parent_id",
            sa.UUID(),
            sa.ForeignKey("knowledge_node.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("node_type", sa.String(20), nullable=False),
        sa.Column("vector_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("schema_definition", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('UTC', now())"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('UTC', now())"),
            nullable=False,
        ),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("idx_kn_user_parent", "knowledge_node", ["user_id", "parent_id"])
    op.create_index("idx_kn_type", "knowledge_node", ["node_type"])

    # dataset_row — rows in a dataset node
    op.create_table(
        "dataset_row",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "dataset_id",
            sa.UUID(),
            sa.ForeignKey("knowledge_node.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("data", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('UTC', now())"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('UTC', now())"),
            nullable=False,
        ),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # knowledge_embedding — vector storage
    op.create_table(
        "knowledge_embedding",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "node_id",
            sa.UUID(),
            sa.ForeignKey("knowledge_node.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "row_id",
            sa.UUID(),
            sa.ForeignKey("dataset_row.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column("model_id", sa.String(100), nullable=False),
        sa.Column("embedding", HALFVEC(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    op.create_index("idx_ke_node", "knowledge_embedding", ["node_id"])
    op.create_index("idx_ke_row", "knowledge_embedding", ["row_id"])
    op.create_index("idx_ke_model", "knowledge_embedding", ["model_id"])
    op.execute("""
        CREATE INDEX idx_ke_model_status
        ON knowledge_embedding (model_id, status)
        WHERE status = 'completed'
    """)

    # HNSW partial indexes for vector search
    op.execute("""
        CREATE INDEX idx_ke_hnsw_openai_3_large
        ON knowledge_embedding
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'openai-3-large'
    """)
    op.execute("""
        CREATE INDEX idx_ke_hnsw_openai_3_small
        ON knowledge_embedding
        USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'openai-3-small'
    """)
    op.execute("""
        CREATE INDEX idx_ke_hnsw_bge_m3
        ON knowledge_embedding
        USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'bge-m3'
    """)

    op.execute("""
        INSERT INTO embedding_config (category, model_id)
        VALUES ('document', 'openai-3-large')
        ON CONFLICT (category) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table("knowledge_embedding")
    op.drop_table("dataset_row")
    op.drop_table("knowledge_node")
    op.execute("DELETE FROM embedding_config WHERE category = 'document'")
