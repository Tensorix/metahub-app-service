"""add message search index table

Revision ID: c8f4a1b2d3e5
Revises: 9bdd44968ec6
Create Date: 2025-01-30 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = 'c8f4a1b2d3e5'
down_revision = '9bdd44968ec6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 安装扩展
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # 2. 创建表
    op.create_table(
        'message_search_index',
        sa.Column('id', sa.UUID(), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('message_id', sa.UUID(), sa.ForeignKey('message.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_id', sa.UUID(), sa.ForeignKey('session.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_type', sa.String(50), nullable=False),
        sa.Column('session_name', sa.String(255), nullable=True),
        sa.Column('topic_id', sa.UUID(), nullable=True),
        sa.Column('sender_name', sa.String(255), nullable=True),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('message_created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('content_text', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(3072), nullable=True),
        sa.Column('embedding_model', sa.String(100), server_default='text-embedding-3-large'),
        sa.Column('indexed_at', sa.DateTime(timezone=True), server_default=sa.text("(NOW() AT TIME ZONE 'UTC')"), nullable=False),
        sa.Column('embedding_status', sa.String(20), server_default='pending', nullable=False),
    )

    # 3. 创建索引
    # pg_trgm GIN 索引
    op.execute("""
        CREATE INDEX idx_search_content_trgm
        ON message_search_index
        USING GIN (content_text gin_trgm_ops)
    """)

    # pgvector HNSW 索引
    op.execute("""
        CREATE INDEX idx_search_embedding_hnsw
        ON message_search_index
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    # B-Tree 索引
    op.create_index('idx_search_user_session_type', 'message_search_index', ['user_id', 'session_type'])
    op.create_index('idx_search_session', 'message_search_index', ['session_id'])
    op.execute("""
        CREATE INDEX idx_search_topic
        ON message_search_index (topic_id)
        WHERE topic_id IS NOT NULL
    """)
    op.create_index('idx_search_session_created', 'message_search_index', ['session_id', 'message_created_at'])
    op.create_index('idx_search_user_created', 'message_search_index', ['user_id', 'message_created_at'])
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
    op.execute("""
        CREATE INDEX idx_search_embedding_status
        ON message_search_index (embedding_status)
        WHERE embedding_status != 'completed'
    """)


def downgrade() -> None:
    op.drop_table('message_search_index')
    # 注意：不删除扩展，因为其他功能可能依赖
