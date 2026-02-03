"""refactor message search to multi-model architecture

Revision ID: d1e2f3a4b5c6
Revises: c8f4a1b2d3e5
Create Date: 2025-02-03 12:00:00.000000

Complete refactor to support multi-model embedding architecture:
- DROP old message_search_index table (single-table with Vector(3072))
- CREATE embedding_config table (active model per category)
- CREATE new message_search_index (text + metadata only, no embedding)
- CREATE message_embedding table (halfvec, multi-model with partial indexes)
- CREATE HNSW partial indexes for each registered model

This is a breaking change — all existing search indexes will be lost.
Run backfill script after migration to rebuild indexes.
"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import HALFVEC

revision = "d1e2f3a4b5c6"
down_revision = ("c8f4a1b2d3e5", "1e62baab2685")  # Merge both heads
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ========================================================================
    # Step 1: Drop old table (no data migration) - use IF EXISTS
    # ========================================================================
    op.execute("DROP TABLE IF EXISTS message_search_index CASCADE")

    # ========================================================================
    # Step 2: Ensure extensions are installed
    # ========================================================================
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ========================================================================
    # Step 3: Create embedding_config table
    # ========================================================================
    op.create_table(
        "embedding_config",
        sa.Column("category", sa.String(100), primary_key=True),
        sa.Column("model_id", sa.String(100), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Insert default config for message category
    op.execute("""
        INSERT INTO embedding_config (category, model_id)
        VALUES ('message', 'openai-3-large')
    """)

    # ========================================================================
    # Step 4: Create new message_search_index (no embedding column)
    # ========================================================================
    op.create_table(
        "message_search_index",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "message_id",
            sa.UUID(),
            sa.ForeignKey("message.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            sa.UUID(),
            sa.ForeignKey("session.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_type", sa.String(50), nullable=False),
        sa.Column("session_name", sa.String(255), nullable=True),
        sa.Column("topic_id", sa.UUID(), nullable=True),
        sa.Column("sender_name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column(
            "message_created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column(
            "indexed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # ========================================================================
    # Step 5: Create message_embedding table (halfvec, no dimension limit)
    # ========================================================================
    op.create_table(
        "message_embedding",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "search_index_id",
            sa.UUID(),
            sa.ForeignKey("message_search_index.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("model_id", sa.String(100), nullable=False),
        sa.Column("embedding", HALFVEC(), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # ========================================================================
    # Step 6: Create indexes on message_search_index
    # ========================================================================

    # pg_trgm GIN index for fuzzy text search
    op.execute("""
        CREATE INDEX idx_search_content_trgm
        ON message_search_index
        USING GIN (content_text gin_trgm_ops)
    """)

    # Filter indexes
    op.create_index(
        "idx_search_user_session_type",
        "message_search_index",
        ["user_id", "session_type"],
    )
    op.create_index(
        "idx_search_session", "message_search_index", ["session_id"]
    )
    op.execute("""
        CREATE INDEX idx_search_topic
        ON message_search_index (topic_id)
        WHERE topic_id IS NOT NULL
    """)
    op.create_index(
        "idx_search_session_created",
        "message_search_index",
        ["session_id", "message_created_at"],
    )
    op.create_index(
        "idx_search_user_created",
        "message_search_index",
        ["user_id", "message_created_at"],
    )

    # pg_trgm on sender_name and session_name for ILIKE filters
    op.execute("""
        CREATE INDEX idx_search_sender_trgm
        ON message_search_index
        USING GIN (sender_name gin_trgm_ops)
        WHERE sender_name IS NOT NULL
    """)
    op.execute("""
        CREATE INDEX idx_search_session_name_trgm
        ON message_search_index
        USING GIN (session_name gin_trgm_ops)
        WHERE session_name IS NOT NULL
    """)

    # ========================================================================
    # Step 7: Create indexes on message_embedding
    # ========================================================================

    # General indexes
    op.create_index(
        "idx_msg_embedding_model", "message_embedding", ["model_id"]
    )
    op.execute("""
        CREATE INDEX idx_msg_embedding_status
        ON message_embedding (status)
        WHERE status != 'completed'
    """)

    # ========================================================================
    # Step 8: Create HNSW partial indexes for each registered model
    # All use halfvec + halfvec_cosine_ops, with expression cast
    # ========================================================================

    # openai-3-large: 3072 dims
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_openai_3_large
        ON message_embedding
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'openai-3-large'
    """)

    # openai-3-small: 1536 dims
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_openai_3_small
        ON message_embedding
        USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'openai-3-small'
    """)

    # bge-m3: 1024 dims
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_bge_m3
        ON message_embedding
        USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'bge-m3'
    """)


def downgrade() -> None:
    # Drop new tables
    op.drop_table("message_embedding")
    op.drop_table("message_search_index")
    op.drop_table("embedding_config")

    # Recreate old table structure (for rollback only, data is lost)
    from pgvector.sqlalchemy import Vector

    op.create_table(
        "message_search_index",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "message_id",
            sa.UUID(),
            sa.ForeignKey("message.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            sa.UUID(),
            sa.ForeignKey("session.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_type", sa.String(50), nullable=False),
        sa.Column("session_name", sa.String(255), nullable=True),
        sa.Column("topic_id", sa.UUID(), nullable=True),
        sa.Column("sender_name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column(
            "message_created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(3072), nullable=True),
        sa.Column(
            "embedding_model",
            sa.String(100),
            server_default="text-embedding-3-large",
        ),
        sa.Column(
            "indexed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(NOW() AT TIME ZONE 'UTC')"),
            nullable=False,
        ),
        sa.Column(
            "embedding_status",
            sa.String(20),
            server_default="pending",
            nullable=False,
        ),
    )
