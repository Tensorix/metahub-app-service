# Step 7: 配置参数与调优

## 1. 配置参数一览

在 `app/config.py` 的 `Settings` 类中添加以下配置：

```python
# app/config.py 新增搜索相关配置

class Settings(BaseSettings):
    # ... 现有配置 ...

    # ============ 搜索配置 ============

    # 上下文窗口大小：无 topic 时返回命中消息前后各 N 条
    SEARCH_CONTEXT_WINDOW_SIZE: int = 5

    # 是否在消息创建时同步生成 embedding
    # True: 实时生成（延迟较高但索引即时可用）
    # False: 异步生成（消息创建快，但向量搜索需要等后台任务）
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

    # Embedding 模型
    SEARCH_EMBEDDING_MODEL: str = "text-embedding-3-large"
    SEARCH_EMBEDDING_DIMENSIONS: int = 3072

    # 最短可索引文本长度（少于此长度跳过 embedding）
    SEARCH_MIN_CONTENT_LENGTH: int = 2

    # 批量 embedding 处理大小
    SEARCH_EMBEDDING_BATCH_SIZE: int = 100

    # 需要索引的 session 类型
    SEARCH_INDEXABLE_SESSION_TYPES: list[str] = ["pm", "group"]
```

## 2. 环境变量

```bash
# .env 文件添加

# 搜索配置
SEARCH_CONTEXT_WINDOW_SIZE=5
SEARCH_SYNC_EMBEDDING=true
SEARCH_FUZZY_THRESHOLD=0.1
SEARCH_VECTOR_THRESHOLD=0.3
SEARCH_FUZZY_WEIGHT=0.4
SEARCH_VECTOR_WEIGHT=0.6
SEARCH_DEFAULT_TOP_K=20
SEARCH_EMBEDDING_MODEL=text-embedding-3-large
SEARCH_EMBEDDING_DIMENSIONS=3072
SEARCH_MIN_CONTENT_LENGTH=2
SEARCH_EMBEDDING_BATCH_SIZE=100
```

## 3. 参数调优指南

### 3.1 上下文窗口大小 (`SEARCH_CONTEXT_WINDOW_SIZE`)

| 值 | 适用场景 | 权衡 |
|----|---------|------|
| 3 | 短消息、快速浏览 | 上下文可能不足 |
| 5 | 通用场景（默认推荐） | 平衡 |
| 10 | 长对话、需要完整上下文 | 响应数据量较大 |
| 20 | 深度分析场景 | 单次请求数据量大 |

### 3.2 模糊搜索阈值 (`SEARCH_FUZZY_THRESHOLD`)

| 值 | 效果 |
|----|------|
| 0.05 | 极宽松，召回率高但精度低，适合 "尽可能找到" |
| 0.1 | 宽松（默认），适合中英文混合场景 |
| 0.2 | 中等，适合英文为主的场景 |
| 0.3 | 严格，只返回高度匹配的结果 |

> **中英文混合注意**：pg_trgm 对中文的相似度得分通常低于英文（因为 trigram 粒度问题），
> 建议中文为主的场景使用 0.05-0.1 的阈值。

### 3.3 向量搜索阈值 (`SEARCH_VECTOR_THRESHOLD`)

| 值 | 效果 |
|----|------|
| 0.2 | 宽松，返回语义相关但可能不太相关的结果 |
| 0.3 | 中等（默认），平衡精度和召回 |
| 0.5 | 严格，只返回语义高度相关的结果 |
| 0.7 | 极严格，几乎只返回同义表达 |

### 3.4 混合搜索权重 (`SEARCH_FUZZY_WEIGHT` / `SEARCH_VECTOR_WEIGHT`)

| 配置 | 适用场景 |
|------|---------|
| fuzzy=0.6, vector=0.4 | 精确关键词搜索为主（人名、ID、专有名词） |
| fuzzy=0.4, vector=0.6 | 语义搜索为主（默认推荐） |
| fuzzy=0.3, vector=0.7 | 重度语义搜索（意图匹配、问答） |
| fuzzy=0.5, vector=0.5 | 均等权重 |

### 3.5 同步/异步 Embedding (`SEARCH_SYNC_EMBEDDING`)

| 模式 | 优势 | 劣势 |
|------|------|------|
| 同步 (`true`) | 索引即时可用 | 消息创建延迟增加 ~200-500ms |
| 异步 (`false`) | 消息创建零延迟 | 向量搜索对新消息有延迟 |

**建议**：
- 消息量小（<100条/分钟）：使用同步模式
- 消息量大（>100条/分钟）：使用异步模式 + 后台 worker

## 4. PostgreSQL 调优

### 4.1 pg_trgm 配置

```sql
-- 设置最低相似度阈值（影响 % 运算符）
SET pg_trgm.similarity_threshold = 0.1;

-- 查看当前设置
SHOW pg_trgm.similarity_threshold;
```

### 4.2 pgvector HNSW 调优

```sql
-- 索引构建参数（创建索引时设置）
-- m: 每个节点的连接数，越大越精确但越慢（默认 16）
-- ef_construction: 构建时搜索范围，越大索引质量越好（默认 64）
CREATE INDEX idx_search_embedding_hnsw
    ON message_search_index
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 搜索参数（会话级别设置）
-- ef_search: 搜索时的候选集大小，越大越精确但越慢
SET hnsw.ef_search = 40;    -- 默认，平衡
SET hnsw.ef_search = 100;   -- 高精度
SET hnsw.ef_search = 20;    -- 高速度
```

### 4.3 数据量与参数建议

| 索引消息量 | HNSW m | ef_construction | ef_search | 预估内存 |
|-----------|--------|-----------------|-----------|---------|
| <10K | 16 | 64 | 40 | ~120MB |
| 10K-100K | 16 | 64 | 40 | ~1.2GB |
| 100K-1M | 16 | 128 | 64 | ~12GB |
| >1M | 32 | 200 | 100 | >12GB，建议分区 |

> **内存估算**: 3072 维 × 4 bytes × 消息数 × ~1.5（索引开销）
> 例如 10 万条: 3072 × 4 × 100,000 × 1.5 ≈ 1.8GB

## 5. 监控和告警

### 关键指标

```python
# 建议监控的指标

# 1. 索引覆盖率
coverage = embedding_completed / total_indexed * 100

# 2. Embedding 失败率
failure_rate = embedding_failed / total_indexed * 100

# 3. 搜索延迟 (P95)
# 可通过 FastAPI middleware 采集

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

## 6. 完整目录结构

实现完成后的新增/修改文件一览：

```
app/
├── config.py                          # [修改] 添加 SEARCH_* 配置
├── db/
│   └── model/
│       ├── __init__.py                # [修改] 导入 MessageSearchIndex
│       └── message_search_index.py    # [新增] 搜索索引模型
├── service/
│   ├── session.py                     # [修改] create_message 触发索引
│   ├── embedding.py                   # [新增] Embedding 生成服务
│   ├── search.py                      # [新增] 混合搜索服务
│   ├── context_retrieval.py           # [新增] 上下文检索服务
│   └── search_indexer.py             # [新增] 索引管理服务
├── agent/
│   ├── deep_agent_service.py          # [修改] 注入 ContextVar (user_id)
│   └── tools/
│       ├── context.py                 # [新增] ContextVar 定义
│       └── builtin/
│           ├── __init__.py            # [修改] 导入 message_search
│           └── message_search.py      # [新增] 搜索工具 (search_messages, get_message_context)

alembic/
└── versions/
    └── xxxx_add_message_search_index.py  # [新增] 迁移脚本

scripts/
├── backfill_search_index.py           # [新增] 批量回填脚本
└── retry_failed_embeddings.py         # [新增] 重试失败的 embedding

docker-compose.yml                     # [修改] postgres:16 → pgvector/pgvector:pg16
pyproject.toml                         # [修改] 添加 pgvector, openai 依赖
```

## 7. 实施顺序建议

1. **更新依赖和 Docker 镜像** — `pyproject.toml` + `docker-compose.yml`
2. **创建数据库模型** — `message_search_index.py`
3. **执行数据库迁移** — Alembic 迁移脚本
4. **实现核心服务** — `embedding.py` → `search_indexer.py` → `search.py` → `context_retrieval.py`
5. **实现工具层** — `context.py` → `message_search.py` → 修改 `deep_agent_service.py`
6. **集成实时索引** — 修改 `MessageService.create_message()`
7. **运行批量回填** — `backfill_search_index.py`
8. **配置 Agent** — 将 `search_messages` 加入 Agent 的 tools 列表
