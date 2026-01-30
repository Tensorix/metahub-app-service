# Step 1: 数据库 Schema 设计与迁移

## 1. 前置条件：PostgreSQL 扩展

需要在数据库中安装以下扩展：

```sql
-- pgvector: 向量存储和相似度搜索
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: trigram 模糊匹配（通常已内置，只需启用）
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

> **注意**: `pgvector` 需要在 PostgreSQL 服务器上预先安装。Docker 环境建议使用 `pgvector/pgvector:pg16` 镜像替代官方 `postgres:16` 镜像。

## 2. 搜索索引表设计

### 核心表：`message_search_index`

```sql
CREATE TABLE message_search_index (
    -- 主键与外键
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL UNIQUE REFERENCES message(id) ON DELETE CASCADE,

    -- 反范式化字段（避免搜索时 JOIN）
    user_id         UUID NOT NULL,
    session_id      UUID NOT NULL,
    session_type    VARCHAR(50) NOT NULL,      -- pm / group
    session_name    VARCHAR(255),               -- 会话/群名快照（用于按群名检索）
    topic_id        UUID,                       -- 可为空
    sender_name     VARCHAR(255),               -- 发送者名称快照
    role            VARCHAR(50) NOT NULL,
    message_created_at TIMESTAMPTZ NOT NULL,    -- 原始消息创建时间

    -- 搜索内容
    content_text    TEXT NOT NULL,               -- 所有 text parts 拼接后的纯文本

    -- 向量嵌入
    embedding       vector(3072),               -- OpenAI text-embedding-3-large

    -- 索引管理
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-large',
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / completed / failed / skipped

    -- 约束
    CONSTRAINT fk_message FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
);

COMMENT ON TABLE message_search_index IS '消息搜索索引表 - 支持模糊搜索和向量检索';
COMMENT ON COLUMN message_search_index.content_text IS '从 message_part 中提取并拼接的纯文本内容';
COMMENT ON COLUMN message_search_index.embedding IS 'OpenAI text-embedding-3-large 生成的 3072 维向量';
COMMENT ON COLUMN message_search_index.embedding_status IS 'embedding 状态: pending=待生成, completed=已完成, failed=失败, skipped=内容过短跳过';
```

### 设计决策说明

**为什么反范式化？**
- 搜索是读密集型操作，避免 JOIN 可以显著提升查询性能
- `session_type` 冗余存储用于快速过滤 pm/group
- `session_name` 快照用于按群名/会话名过滤（Agent 工具需要此能力）
- `sender_name` 快照避免搜索结果展示时的额外查询
- `message_created_at` 用于时间排序和上下文检索

**为什么 `content_text` 而不是直接搜索 `message_part`？**
- 一条消息可能有多个 text parts，搜索需要完整语义
- 预拼接避免搜索时的子查询
- 向量嵌入需要完整文本输入

**`embedding_status` 的作用**：
- `pending`：消息已创建索引记录，等待异步生成 embedding
- `completed`：embedding 已生成
- `failed`：embedding 生成失败（API 错误等），可以重试
- `skipped`：内容过短（如纯表情、单字符），跳过 embedding 生成

## 3. 索引设计

```sql
-- 1. pg_trgm GIN 索引：支持模糊搜索
CREATE INDEX idx_search_content_trgm
    ON message_search_index
    USING GIN (content_text gin_trgm_ops);

-- 2. pgvector HNSW 索引：支持向量近似搜索（cosine 距离）
CREATE INDEX idx_search_embedding_hnsw
    ON message_search_index
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 3. 用户 + 会话类型复合索引：支持过滤
CREATE INDEX idx_search_user_session_type
    ON message_search_index (user_id, session_type);

-- 4. 会话内搜索索引
CREATE INDEX idx_search_session
    ON message_search_index (session_id);

-- 5. Topic 索引：支持父子上下文检索
CREATE INDEX idx_search_topic
    ON message_search_index (topic_id)
    WHERE topic_id IS NOT NULL;

-- 6. 消息时间索引：支持上下文窗口查询和时间范围过滤
CREATE INDEX idx_search_session_created
    ON message_search_index (session_id, message_created_at);

-- 7. 用户 + 时间索引：支持全局时间范围过滤
CREATE INDEX idx_search_user_created
    ON message_search_index (user_id, message_created_at);

-- 8. 发送者名称 trgm 索引：支持按人名模糊过滤
CREATE INDEX idx_search_sender_trgm
    ON message_search_index
    USING GIN (sender_name gin_trgm_ops)
    WHERE sender_name IS NOT NULL;

-- 9. 会话名称 trgm 索引：支持按群名模糊过滤
CREATE INDEX idx_search_session_name_trgm
    ON message_search_index
    USING GIN (session_name gin_trgm_ops)
    WHERE session_name IS NOT NULL;

-- 10. Embedding 状态索引：支持批量处理未完成的 embedding
CREATE INDEX idx_search_embedding_status
    ON message_search_index (embedding_status)
    WHERE embedding_status != 'completed';
```

### 索引选型说明

| 索引 | 类型 | 用途 |
|------|------|------|
| `idx_search_content_trgm` | GIN (pg_trgm) | 模糊文本搜索，支持 `%query%` 和 `similarity()` |
| `idx_search_embedding_hnsw` | HNSW (pgvector) | 高性能向量近似搜索，recall ~95%+ |
| `idx_search_user_session_type` | B-Tree | 按用户和会话类型过滤 |
| `idx_search_session` | B-Tree | 会话内搜索过滤 |
| `idx_search_topic` | B-Tree (partial) | 上下文检索时快速找 topic 内的消息 |
| `idx_search_session_created` | B-Tree (composite) | 上下文窗口：找某消息前后 N 条 |
| `idx_search_user_created` | B-Tree (composite) | 全局搜索时的时间范围过滤 |
| `idx_search_sender_trgm` | GIN (pg_trgm, partial) | 按发送者名称模糊过滤 |
| `idx_search_session_name_trgm` | GIN (pg_trgm, partial) | 按群名/会话名模糊过滤 |
| `idx_search_embedding_status` | B-Tree (partial) | 批量处理 pending/failed 的 embedding |

**HNSW vs IVFFlat**：选择 HNSW 因为它在不重建索引的情况下支持增量插入，更适合实时索引场景。`m=16, ef_construction=64` 是中等规模数据的推荐参数。

## 4. SQLAlchemy Model 定义

```python
# app/db/model/message_search_index.py

from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class MessageSearchIndex(Base):
    """消息搜索索引表 - 支持模糊搜索和向量检索"""
    __tablename__ = "message_search_index"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("message.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        comment="关联消息ID"
    )

    # 反范式化字段
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属用户ID"
    )
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False,
        comment="所属会话ID"
    )
    session_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="会话类型: pm/group"
    )
    session_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="会话/群名快照"
    )
    topic_id: Mapped[Optional[UUID]] = mapped_column(
        nullable=True, comment="所属话题ID"
    )
    sender_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="发送者名称快照"
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, comment="消息角色"
    )
    message_created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, comment="原始消息创建时间"
    )

    # 搜索内容
    content_text: Mapped[str] = mapped_column(
        Text, nullable=False, comment="拼接后的纯文本内容"
    )

    # 向量嵌入
    embedding = mapped_column(
        Vector(3072), nullable=True, comment="text-embedding-3-large 向量"
    )

    # 索引管理
    embedding_model: Mapped[Optional[str]] = mapped_column(
        String(100), default="text-embedding-3-large",
        comment="嵌入模型名称"
    )
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="索引时间"
    )
    embedding_status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False,
        comment="embedding状态: pending/completed/failed/skipped"
    )

    # Relationships
    message: Mapped["Message"] = relationship("Message")

    __table_args__ = (
        Index("idx_search_content_trgm", "content_text",
              postgresql_using="gin",
              postgresql_ops={"content_text": "gin_trgm_ops"}),
        Index("idx_search_user_session_type", "user_id", "session_type"),
        Index("idx_search_session", "session_id"),
        Index("idx_search_topic", "topic_id",
              postgresql_where="topic_id IS NOT NULL"),
        Index("idx_search_session_created", "session_id", "message_created_at"),
        Index("idx_search_embedding_status", "embedding_status",
              postgresql_where="embedding_status != 'completed'"),
    )
```

> **注意**: HNSW 索引需要通过 Alembic 迁移中的 raw SQL 创建，因为 SQLAlchemy 对 pgvector 的 HNSW 参数支持有限。

## 5. Alembic 迁移脚本

```python
# alembic/versions/xxxx_add_message_search_index.py

"""add message search index table

Revision ID: xxxx
Revises: previous_revision
Create Date: 2025-xx-xx
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = 'xxxx'
down_revision = 'previous_revision'
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
```

## 6. Docker 镜像更新

`docker-compose.yml` 中的 PostgreSQL 需要更换为支持 pgvector 的镜像：

```yaml
services:
  db:
    image: pgvector/pgvector:pg16   # 替换 postgres:16
    # ... 其余配置不变
```

## 7. Python 依赖

```toml
# pyproject.toml 新增
[project.dependencies]
# ... 现有依赖
pgvector = ">=0.3.0"      # SQLAlchemy pgvector 类型支持
openai = ">=1.0.0"         # OpenAI API (embedding 生成)
```
