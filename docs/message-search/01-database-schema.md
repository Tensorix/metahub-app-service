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

## 2. 整体表结构

本设计将搜索索引拆分为三张表：

```
message_search_index (文本 + 元数据，无 embedding)
    ↓ 1:1 FK (search_index_id)
message_embedding (单表多模型，halfvec 无维度限制)

embedding_config (每个业务类别的活跃模型配置)
```

拆分原因：
- **embedding 解耦**：模型切换时只操作 `message_embedding`，不影响已建立的文本索引
- **单表多模型**：`halfvec` 不指定维度，配合表达式部分索引实现每模型独立 HNSW
- **存储减半**：统一使用 `halfvec`（float16），存储减半，精度损失 < 0.1%

## 3. 表设计

### 3.1 `embedding_config` — 活跃模型持久化

```sql
CREATE TABLE embedding_config (
    category    VARCHAR(100) PRIMARY KEY,    -- 'message', 'document' 等
    model_id    VARCHAR(100) NOT NULL,       -- EMBEDDING_MODELS 注册表中的 key
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

每个业务类别（message、document 等）对应一条记录，指向当前使用的 embedding 模型。切换模型只需 UPDATE 此表。

### 3.2 `message_search_index` — 文本 + 元数据（无 embedding）

```sql
CREATE TABLE message_search_index (
    -- 主键与外键
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id          UUID NOT NULL UNIQUE REFERENCES message(id) ON DELETE CASCADE,

    -- 反范式化字段（避免搜索时 JOIN）
    user_id             UUID NOT NULL,
    session_id          UUID NOT NULL,
    session_type        VARCHAR(50) NOT NULL,       -- pm / group
    session_name        VARCHAR(255),               -- 会话/群名快照
    topic_id            UUID,                       -- 可为空
    sender_name         VARCHAR(255),               -- 发送者名称快照
    role                VARCHAR(50) NOT NULL,
    message_created_at  TIMESTAMPTZ NOT NULL,       -- 原始消息创建时间

    -- 搜索内容
    content_text        TEXT NOT NULL,               -- 所有 text parts 拼接后的纯文本

    -- 索引管理
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 约束
    CONSTRAINT fk_message FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
);

COMMENT ON TABLE message_search_index IS '消息搜索索引表 - 存储可搜索文本与元数据，不含 embedding';
COMMENT ON COLUMN message_search_index.content_text IS '从 message_part 中提取并拼接的纯文本内容';
```

> **注意**：相比旧设计，此表不再包含 `embedding`、`embedding_model`、`embedding_status` 列。
> 这些信息移至独立的 `message_embedding` 表。

### 3.3 `message_embedding` — 单表多模型向量存储

```sql
CREATE TABLE message_embedding (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_index_id UUID NOT NULL UNIQUE
                    REFERENCES message_search_index(id) ON DELETE CASCADE,
    model_id        VARCHAR(100) NOT NULL,       -- 生成此 embedding 的模型
    embedding       halfvec NOT NULL,            -- halfvec 不指定维度，存任意维度
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**关键设计决策**：
- `halfvec` 列**不指定维度**，允许不同模型写入不同长度的向量
- 每条 `message_search_index` 记录最多关联**一条** embedding（1:1 UNIQUE FK）
- `model_id` 记录生成此 embedding 的模型，用于部分索引过滤
- `status`: `pending` / `completed` / `failed`

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

**为什么拆分 embedding 到独立表？**
- 模型切换时只需 DELETE + INSERT `message_embedding`，`message_search_index` 不受影响
- 模糊搜索在模型切换全程可用
- 不同模型的向量维度不同，独立表更清晰

**为什么用 halfvec？**
- float16 存储，空间减半（3072 维: 12KB → 6KB/条）
- pgvector halfvec HNSW 支持到 4000 维
- 精度损失 < 0.1%，对相似度排序可忽略

## 4. 索引设计

### 4.1 `message_search_index` 索引

```sql
-- 1. pg_trgm GIN 索引：支持模糊搜索
CREATE INDEX idx_search_content_trgm
    ON message_search_index
    USING GIN (content_text gin_trgm_ops);

-- 2. 用户 + 会话类型复合索引：支持过滤
CREATE INDEX idx_search_user_session_type
    ON message_search_index (user_id, session_type);

-- 3. 会话内搜索索引
CREATE INDEX idx_search_session
    ON message_search_index (session_id);

-- 4. Topic 索引：支持父子上下文检索
CREATE INDEX idx_search_topic
    ON message_search_index (topic_id)
    WHERE topic_id IS NOT NULL;

-- 5. 消息时间索引：支持上下文窗口查询和时间范围过滤
CREATE INDEX idx_search_session_created
    ON message_search_index (session_id, message_created_at);

-- 6. 用户 + 时间索引：支持全局时间范围过滤
CREATE INDEX idx_search_user_created
    ON message_search_index (user_id, message_created_at);

-- 7. 发送者名称 trgm 索引：支持按人名模糊过滤
CREATE INDEX idx_search_sender_trgm
    ON message_search_index
    USING GIN (sender_name gin_trgm_ops)
    WHERE sender_name IS NOT NULL;

-- 8. 会话名称 trgm 索引：支持按群名模糊过滤
CREATE INDEX idx_search_session_name_trgm
    ON message_search_index
    USING GIN (session_name gin_trgm_ops)
    WHERE session_name IS NOT NULL;
```

### 4.2 `message_embedding` 索引

```sql
-- 通用索引
CREATE INDEX idx_msg_embedding_model ON message_embedding (model_id);
CREATE INDEX idx_msg_embedding_status ON message_embedding (status)
    WHERE status != 'completed';

-- ================================================================
-- 每模型的 HNSW 部分索引（全部由 Alembic 迁移创建，统一 halfvec）
-- 添加新模型时需要新增对应的 HNSW 索引迁移
-- ================================================================

-- openai-3-large: 3072 dims
CREATE INDEX idx_msg_embedding_hnsw_openai_3_large
    ON message_embedding
    USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE model_id = 'openai-3-large';

-- openai-3-small: 1536 dims
CREATE INDEX idx_msg_embedding_hnsw_openai_3_small
    ON message_embedding
    USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE model_id = 'openai-3-small';

-- bge-m3: 1024 dims
CREATE INDEX idx_msg_embedding_hnsw_bge_m3
    ON message_embedding
    USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE model_id = 'bge-m3';
```

### 索引选型说明

| 索引 | 类型 | 用途 |
|------|------|------|
| `idx_search_content_trgm` | GIN (pg_trgm) | 模糊文本搜索，支持 `%query%` 和 `similarity()` |
| `idx_search_user_session_type` | B-Tree | 按用户和会话类型过滤 |
| `idx_search_session` | B-Tree | 会话内搜索过滤 |
| `idx_search_topic` | B-Tree (partial) | 上下文检索时快速找 topic 内的消息 |
| `idx_search_session_created` | B-Tree (composite) | 上下文窗口：找某消息前后 N 条 |
| `idx_search_user_created` | B-Tree (composite) | 全局搜索时的时间范围过滤 |
| `idx_search_sender_trgm` | GIN (pg_trgm, partial) | 按发送者名称模糊过滤 |
| `idx_search_session_name_trgm` | GIN (pg_trgm, partial) | 按群名/会话名模糊过滤 |
| `idx_msg_embedding_model` | B-Tree | 按模型过滤 embedding |
| `idx_msg_embedding_status` | B-Tree (partial) | 批量处理 pending/failed 的 embedding |
| `idx_msg_embedding_hnsw_*` | HNSW (partial, expression) | 每模型独立的向量近似搜索 |

**HNSW vs IVFFlat**：选择 HNSW 因为它在不重建索引的情况下支持增量插入，更适合实时索引场景。`m=16, ef_construction=64` 是中等规模数据的推荐参数。

**HNSW 部分索引关键点**：
- 使用**表达式索引** `(embedding::halfvec(N))` 进行维度 cast
- 使用 `WHERE model_id = 'xxx'` 实现部分索引
- 查询时必须同时包含相同的 cast 和 WHERE 条件才能命中索引

## 5. 查询示例

向量搜索时匹配 cast + WHERE（统一 halfvec）：

```sql
-- 示例：使用 openai-3-large (3072 dims)
SELECT t.*, (1 - (e.embedding::halfvec(3072) <=> :query_vec::halfvec(3072))) AS vector_score
FROM message_search_index t
JOIN message_embedding e ON e.search_index_id = t.id
WHERE e.model_id = 'openai-3-large'
  AND e.status = 'completed'
  AND t.user_id = :user_id
  -- ... 其他过滤条件
ORDER BY e.embedding::halfvec(3072) <=> :query_vec::halfvec(3072)
LIMIT :top_k;
```

所有模型查询格式相同，只有 `halfvec(N)` 的 N 和 `model_id` 不同。cast 表达式由 `EmbeddingModelConfig.index_cast` 自动生成。

## 6. SQLAlchemy Model 定义

### 6.1 `EmbeddingConfig`

```python
# app/db/model/embedding_config.py

from app.db.model.base import Base
from datetime import datetime
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column


class EmbeddingConfig(Base):
    """活跃模型配置表 — 每个业务类别对应一条记录"""
    __tablename__ = "embedding_config"

    category: Mapped[str] = mapped_column(
        String(100), primary_key=True,
        comment="业务类别: message, document 等"
    )
    model_id: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="EMBEDDING_MODELS 注册表中的 key"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(), onupdate=func.now(),
        nullable=False, comment="最后更新时间"
    )
```

### 6.2 `MessageSearchIndex`

```python
# app/db/model/message_search_index.py

from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime, ForeignKey, Index, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class MessageSearchIndex(Base):
    """搜索索引表 — 存储可搜索文本与元数据，不含 embedding"""
    __tablename__ = "message_search_index"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("message.id", ondelete="CASCADE"),
        unique=True, nullable=False, comment="关联消息ID"
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False, comment="所属用户ID（反范式）"
    )
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("session.id", ondelete="CASCADE"),
        nullable=False, comment="所属会话ID（反范式）"
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
    content_text: Mapped[str] = mapped_column(
        Text, nullable=False, comment="拼接后的纯文本内容"
    )
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(), nullable=False,
        comment="索引写入时间"
    )

    # Relationships
    embedding: Mapped[Optional["MessageEmbedding"]] = relationship(
        "MessageEmbedding", back_populates="search_index",
        uselist=False, cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_search_content_trgm", "content_text",
              postgresql_using="gin",
              postgresql_ops={"content_text": "gin_trgm_ops"}),
        Index("idx_search_user_session_type", "user_id", "session_type"),
        Index("idx_search_session", "session_id"),
        Index("idx_search_topic", "topic_id"),
        Index("idx_search_session_created", "session_id", "message_created_at"),
        Index("idx_search_user_created", "user_id", "message_created_at"),
        Index("idx_search_sender_trgm", "sender_name",
              postgresql_using="gin",
              postgresql_ops={"sender_name": "gin_trgm_ops"}),
        Index("idx_search_session_name_trgm", "session_name",
              postgresql_using="gin",
              postgresql_ops={"session_name": "gin_trgm_ops"}),
    )
```

### 6.3 `MessageEmbedding`

```python
# app/db/model/message_embedding.py

from app.db.model.base import Base
from datetime import datetime
from uuid import UUID, uuid7

from pgvector.sqlalchemy import HALFVEC
from sqlalchemy import (
    DateTime, ForeignKey, Index, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class MessageEmbedding(Base):
    """向量存储表 — halfvec 不指定维度，配合表达式部分索引实现多模型 HNSW"""
    __tablename__ = "message_embedding"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    search_index_id: Mapped[UUID] = mapped_column(
        ForeignKey("message_search_index.id", ondelete="CASCADE"),
        unique=True, nullable=False, comment="关联搜索索引记录"
    )
    model_id: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="生成此 embedding 的模型ID"
    )
    embedding: Mapped[list] = mapped_column(
        HALFVEC(), nullable=False, comment="halfvec 向量（无维度限制）"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending",
        server_default="pending", comment="状态: pending/completed/failed"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(), nullable=False, comment="创建时间"
    )

    # Relationships
    search_index: Mapped["MessageSearchIndex"] = relationship(
        "MessageSearchIndex", back_populates="embedding"
    )

    __table_args__ = (
        Index("idx_msg_embedding_model", "model_id"),
        Index("idx_msg_embedding_status", "status",
              postgresql_where="status != 'completed'"),
    )
```

> **注意**: HNSW 部分索引需要通过 Alembic 迁移中的 raw SQL 创建，因为 SQLAlchemy 不支持表达式部分索引的声明式定义。

## 7. Alembic 迁移脚本

```python
# alembic/versions/xxxx_add_message_search_system.py

"""add message search system (search_index + embedding + config)

Revision ID: xxxx
Revises: previous_revision
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import HALFVEC

revision = 'xxxx'
down_revision = 'previous_revision'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 安装扩展
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # 2. 创建 embedding_config 表
    op.create_table(
        'embedding_config',
        sa.Column('category', sa.String(100), primary_key=True),
        sa.Column('model_id', sa.String(100), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
    )

    # 3. 创建 message_search_index 表（无 embedding 列）
    op.create_table(
        'message_search_index',
        sa.Column('id', sa.UUID(), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('message_id', sa.UUID(),
                  sa.ForeignKey('message.id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('user_id', sa.UUID(),
                  sa.ForeignKey('user.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('session_id', sa.UUID(),
                  sa.ForeignKey('session.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('session_type', sa.String(50), nullable=False),
        sa.Column('session_name', sa.String(255), nullable=True),
        sa.Column('topic_id', sa.UUID(), nullable=True),
        sa.Column('sender_name', sa.String(255), nullable=True),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('message_created_at', sa.DateTime(timezone=True),
                  nullable=False),
        sa.Column('content_text', sa.Text(), nullable=False),
        sa.Column('indexed_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
    )

    # 4. 创建 message_embedding 表（halfvec 无维度限制）
    op.create_table(
        'message_embedding',
        sa.Column('id', sa.UUID(), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('search_index_id', sa.UUID(),
                  sa.ForeignKey('message_search_index.id',
                                ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('model_id', sa.String(100), nullable=False),
        sa.Column('embedding', HALFVEC(), nullable=False),
        sa.Column('status', sa.String(20),
                  server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
    )

    # 5. message_search_index 索引
    op.execute("""
        CREATE INDEX idx_search_content_trgm
        ON message_search_index
        USING GIN (content_text gin_trgm_ops)
    """)
    op.create_index('idx_search_user_session_type',
                    'message_search_index', ['user_id', 'session_type'])
    op.create_index('idx_search_session',
                    'message_search_index', ['session_id'])
    op.execute("""
        CREATE INDEX idx_search_topic
        ON message_search_index (topic_id)
        WHERE topic_id IS NOT NULL
    """)
    op.create_index('idx_search_session_created',
                    'message_search_index',
                    ['session_id', 'message_created_at'])
    op.create_index('idx_search_user_created',
                    'message_search_index',
                    ['user_id', 'message_created_at'])
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

    # 6. message_embedding 通用索引
    op.create_index('idx_msg_embedding_model',
                    'message_embedding', ['model_id'])
    op.execute("""
        CREATE INDEX idx_msg_embedding_status
        ON message_embedding (status)
        WHERE status != 'completed'
    """)

    # 7. 每模型 HNSW 部分索引（统一 halfvec + halfvec_cosine_ops）
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_openai_3_large
        ON message_embedding
        USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'openai-3-large'
    """)
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_openai_3_small
        ON message_embedding
        USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'openai-3-small'
    """)
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_bge_m3
        ON message_embedding
        USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'bge-m3'
    """)

    # 8. 插入默认 embedding_config
    op.execute("""
        INSERT INTO embedding_config (category, model_id)
        VALUES ('message', 'openai-3-large')
    """)


def downgrade() -> None:
    op.drop_table('message_embedding')
    op.drop_table('message_search_index')
    op.drop_table('embedding_config')
    # 注意：不删除扩展，因为其他功能可能依赖
```

### 添加新模型的迁移示例

```python
# alembic/versions/xxxx_add_hnsw_index_for_new_model.py

"""add HNSW index for new_model

Revision ID: xxxx
Revises: previous_revision
"""
from alembic import op

revision = 'xxxx'
down_revision = 'previous_revision'


def upgrade() -> None:
    # 与 EMBEDDING_MODELS 注册表中的配置对应
    op.execute("""
        CREATE INDEX idx_msg_embedding_hnsw_new_model
        ON message_embedding
        USING hnsw ((embedding::halfvec(768)) halfvec_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        WHERE model_id = 'new-model'
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_msg_embedding_hnsw_new_model")
```

## 8. Docker 镜像更新

`docker-compose.yml` 中的 PostgreSQL 需要更换为支持 pgvector 的镜像：

```yaml
services:
  db:
    image: pgvector/pgvector:pg16   # 替换 postgres:16
    # ... 其余配置不变
```

## 9. Python 依赖

```toml
# pyproject.toml 新增
[project.dependencies]
# ... 现有依赖
pgvector = ">=0.3.0"      # SQLAlchemy pgvector 类型支持 (HALFVEC)
openai = ">=1.30.0"        # OpenAI API (embedding 生成)
tiktoken = ">=0.7.0"       # Token 计数（文本截断）
```
