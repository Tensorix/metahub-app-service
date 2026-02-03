# Step 7: 配置参数与调优

## 1. 配置体系概览

新设计将配置分为两层：

| 层级 | 位置 | 说明 | 修改方式 |
|------|------|------|----------|
| **模型注册表** | `app/config/embedding.py` | 所有可用 embedding 模型的静态配置 | 改代码 + 部署 |
| **活跃模型** | `embedding_config` 表 | 每个业务类别当前使用的模型 | Admin API |
| **搜索参数** | `app/config.py` (env) | 阈值、权重、窗口大小等运行时参数 | 环境变量 |

> **旧设计**中 `SEARCH_EMBEDDING_MODEL` 和 `SEARCH_EMBEDDING_DIMENSIONS` 已移除。
> 模型配置统一由注册表管理，活跃模型由 `embedding_config` 表控制。

## 2. 模型注册表 (`app/config/embedding.py`)

```python
@dataclass(frozen=True)
class EmbeddingModelConfig:
    model_id: str              # 注册表 key，如 "openai-3-large"
    provider: str              # "openai" | "http"
    model_name: str            # 传给 API 的模型名称
    dimensions: int            # 输出向量维度
    max_tokens: int = 8191
    batch_size: int = 100
    api_base_url: str | None = None
    api_key_env: str | None = None


EMBEDDING_MODELS: dict[str, EmbeddingModelConfig] = {
    "openai-3-large": EmbeddingModelConfig(
        model_id="openai-3-large",
        provider="openai",
        model_name="text-embedding-3-large",
        dimensions=3072,
    ),
    "openai-3-small": EmbeddingModelConfig(
        model_id="openai-3-small",
        provider="openai",
        model_name="text-embedding-3-small",
        dimensions=1536,
    ),
    "bge-m3": EmbeddingModelConfig(
        model_id="bge-m3",
        provider="http",
        model_name="BAAI/bge-m3",
        dimensions=1024,
        api_base_url="http://localhost:8080",
    ),
}

DEFAULT_EMBEDDING_MODEL = "openai-3-large"
```

### 添加新模型

1. 在 `EMBEDDING_MODELS` 中添加配置
2. 创建 Alembic 迁移添加 HNSW 部分索引
3. 部署后通过 Admin API 切换

## 3. 活跃模型配置 (`embedding_config` 表)

```sql
-- 查看当前配置
SELECT * FROM embedding_config;

-- category | model_id        | updated_at
-- message  | openai-3-large  | 2025-01-01 00:00:00+00

-- 通过 Admin API 切换（推荐）
POST /api/v1/admin/embedding/switch
{ "category": "message", "model_id": "openai-3-small" }

-- 或直接 SQL 操作
UPDATE embedding_config SET model_id = 'openai-3-small' WHERE category = 'message';
```

## 4. 搜索运行时参数 (`app/config.py`)

```python
class Settings(BaseSettings):
    # ... 现有配置 ...

    # ============ 搜索配置 ============

    # 上下文窗口大小：无 topic 时返回命中消息前后各 N 条
    SEARCH_CONTEXT_WINDOW_SIZE: int = 5

    # 是否在消息创建时同步生成 embedding
    SEARCH_SYNC_EMBEDDING: bool = True

    # 模糊搜索最低相似度阈值 (0.0 - 1.0)
    SEARCH_FUZZY_THRESHOLD: float = 0.1

    # 向量搜索最低相似度阈值 (0.0 - 1.0)
    SEARCH_VECTOR_THRESHOLD: float = 0.3

    # 混合搜索权重
    SEARCH_FUZZY_WEIGHT: float = 0.4
    SEARCH_VECTOR_WEIGHT: float = 0.6

    # 默认返回结果数量
    SEARCH_DEFAULT_TOP_K: int = 20

    # 最短可索引文本长度（少于此长度跳过 embedding）
    SEARCH_MIN_CONTENT_LENGTH: int = 2

    # 需要索引的 session 类型
    SEARCH_INDEXABLE_SESSION_TYPES: list[str] = ["pm", "group"]
```

> **已移除的配置**：`SEARCH_EMBEDDING_MODEL`、`SEARCH_EMBEDDING_DIMENSIONS`、`SEARCH_EMBEDDING_BATCH_SIZE`。
> 这些现在由模型注册表统一管理。

## 5. 环境变量

```bash
# .env 文件

# 搜索配置
SEARCH_CONTEXT_WINDOW_SIZE=5
SEARCH_SYNC_EMBEDDING=true
SEARCH_FUZZY_THRESHOLD=0.1
SEARCH_VECTOR_THRESHOLD=0.3
SEARCH_FUZZY_WEIGHT=0.4
SEARCH_VECTOR_WEIGHT=0.6
SEARCH_DEFAULT_TOP_K=20
SEARCH_MIN_CONTENT_LENGTH=2

# OpenAI（供 openai-3-large / openai-3-small 使用）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# 其他 Provider 的 API key（按需配置）
# VOYAGE_API_KEY=xxx
# COHERE_API_KEY=xxx
```

## 6. 参数调优指南

### 6.1 上下文窗口大小 (`SEARCH_CONTEXT_WINDOW_SIZE`)

| 值 | 适用场景 | 权衡 |
|----|---------|------|
| 3 | 短消息、快速浏览 | 上下文可能不足 |
| 5 | 通用场景（默认推荐） | 平衡 |
| 10 | 长对话、需要完整上下文 | 响应数据量较大 |
| 20 | 深度分析场景 | 单次请求数据量大 |

### 6.2 模糊搜索阈值 (`SEARCH_FUZZY_THRESHOLD`)

| 值 | 效果 |
|----|------|
| 0.05 | 极宽松，召回率高但精度低 |
| 0.1 | 宽松（默认），适合中英文混合场景 |
| 0.2 | 中等，适合英文为主的场景 |
| 0.3 | 严格，只返回高度匹配的结果 |

> **中英文混合注意**：pg_trgm 对中文的相似度得分通常低于英文（trigram 粒度问题），
> 建议中文为主的场景使用 0.05-0.1 的阈值。

### 6.3 向量搜索阈值 (`SEARCH_VECTOR_THRESHOLD`)

| 值 | 效果 |
|----|------|
| 0.2 | 宽松，返回语义相关但可能不太精确的结果 |
| 0.3 | 中等（默认），平衡精度和召回 |
| 0.5 | 严格，只返回语义高度相关的结果 |
| 0.7 | 极严格，几乎只返回同义表达 |

### 6.4 混合搜索权重

| 配置 | 适用场景 |
|------|---------|
| fuzzy=0.6, vector=0.4 | 精确关键词搜索为主（人名、ID、专有名词） |
| fuzzy=0.4, vector=0.6 | 语义搜索为主（默认推荐） |
| fuzzy=0.3, vector=0.7 | 重度语义搜索（意图匹配、问答） |
| fuzzy=0.5, vector=0.5 | 均等权重 |

### 6.5 同步/异步 Embedding (`SEARCH_SYNC_EMBEDDING`)

| 模式 | 优势 | 劣势 |
|------|------|------|
| 同步 (`true`) | 索引即时可用 | 消息创建延迟增加 ~200-500ms |
| 异步 (`false`) | 消息创建零延迟 | 向量搜索对新消息有延迟 |

### 6.6 模型选择

| 模型 | 维度 | 成本 | 精度 | 速度 | 适用场景 |
|------|------|------|------|------|----------|
| `openai-3-large` | 3072 | $0.13/1M | 最高 | 中等 | 默认推荐，质量优先 |
| `openai-3-small` | 1536 | $0.02/1M | 高 | 快 | 成本敏感，大量数据 |
| `bge-m3` (本地) | 1024 | 免费 | 高 | 取决于硬件 | 隐私要求、离线环境 |

## 7. PostgreSQL 调优

### 7.1 pg_trgm 配置

```sql
SET pg_trgm.similarity_threshold = 0.1;
SHOW pg_trgm.similarity_threshold;
```

### 7.2 pgvector HNSW 调优

```sql
-- 搜索参数（会话级别设置）
SET hnsw.ef_search = 40;    -- 默认，平衡
SET hnsw.ef_search = 100;   -- 高精度
SET hnsw.ef_search = 20;    -- 高速度
```

### 7.3 数据量与参数建议

| 索引消息量 | HNSW m | ef_construction | ef_search | 预估内存 (halfvec 3072) |
|-----------|--------|-----------------|-----------|------------------------|
| <10K | 16 | 64 | 40 | ~60MB |
| 10K-100K | 16 | 64 | 40 | ~600MB |
| 100K-1M | 16 | 128 | 64 | ~6GB |
| >1M | 32 | 200 | 100 | >6GB，建议分区 |

> **halfvec 内存估算**: 3072 维 × 2 bytes × 消息数 × ~1.5（索引开销）
> 例如 10 万条: 3072 × 2 × 100,000 × 1.5 ≈ 0.9GB
> 对比旧设计 (vector float32): 3072 × 4 × 100,000 × 1.5 ≈ 1.8GB —— **存储减半**

## 8. 监控和告警

### 关键指标

```python
# 1. 索引覆盖率
coverage = embedding_completed / total_indexed * 100

# 2. Embedding 失败率
failure_rate = embedding_failed / total_indexed * 100

# 3. 搜索延迟 (P95)

# 4. 索引积压（pending 数量）
backlog = embedding_pending
```

### 告警阈值建议

| 指标 | 警告 | 严重 |
|------|------|------|
| embedding 失败率 | >5% | >20% |
| 搜索 P95 延迟 | >500ms | >2000ms |
| 索引积压 | >1000 | >10000 |
| 磁盘使用率 | >70% | >85% |

## 9. 完整目录结构

```
app/
├── config.py                          # [修改] 搜索运行时参数
├── config/
│   ├── __init__.py
│   └── embedding.py                   # [新增] 模型注册表
├── db/
│   └── model/
│       ├── __init__.py                # [修改] 导入新模型
│       ├── embedding_config.py        # [新增] 活跃模型配置
│       ├── message_search_index.py    # [新增] 搜索索引（无 embedding）
│       └── message_embedding.py       # [新增] 向量存储（halfvec 多模型）
├── service/
│   ├── session.py                     # [修改] create_message 触发索引
│   ├── embedding.py                   # [新增] Provider ABC + 实现 + EmbeddingService
│   ├── context_retrieval.py           # [新增] 上下文检索服务
│   ├── search_indexer.py              # [新增] 索引管理（双表写入）
│   └── search/
│       ├── __init__.py
│       ├── provider.py                # [新增] SearchProvider ABC
│       ├── engine.py                  # [新增] HybridSearchEngine (JOIN + dynamic cast)
│       ├── message_provider.py        # [新增] 消息搜索 Provider
│       └── search_service.py          # [新增] SearchService 入口
├── router/
│   └── v1/
│       └── admin_embedding.py         # [新增] 模型切换 Admin API
├── agent/
│   ├── deep_agent_service.py          # [修改] 注入 ContextVar
│   └── tools/
│       ├── context.py                 # [新增] ContextVar 定义
│       └── builtin/
│           └── message_search.py      # [新增] 搜索工具

alembic/
└── versions/
    └── xxxx_add_message_search_system.py  # [新增] 迁移（3 表 + 索引）

scripts/
├── backfill_search_index.py           # [新增] 批量回填
└── retry_failed_embeddings.py         # [新增] 重试失败 embedding

pyproject.toml                         # [修改] 添加 pgvector, openai, tiktoken
docker-compose.yml                     # [修改] postgres → pgvector/pgvector:pg16
```

## 10. 实施顺序建议

1. **更新依赖和 Docker 镜像** — `pyproject.toml` + `docker-compose.yml`
2. **创建配置模块** — `app/config/embedding.py`
3. **创建数据库模型** — 3 个新模型文件
4. **执行数据库迁移** — Alembic 迁移脚本
5. **实现核心服务** — `embedding.py` → `search_indexer.py` → `search/` → `context_retrieval.py`
6. **实现 Admin API** — `admin_embedding.py`
7. **实现工具层** — `context.py` → `message_search.py` → 修改 `deep_agent_service.py`
8. **集成实时索引** — 修改 `MessageService.create_message()`
9. **运行批量回填** — `scripts/backfill_search_index.py`
10. **配置 Agent** — 将 `search_messages` 加入 Agent 的 tools 列表
