# 消息搜索功能实现总结

## 概述

已成功实现基于 `docs/message-search` 文档的完整消息混合搜索系统，作为 Agent 内置工具，支持模糊搜索和语义向量检索。

## 实现的功能

### 1. 数据库层 (Step 1)

- ✅ 创建 `MessageSearchIndex` 模型 (`app/db/model/message_search_index.py`)
- ✅ 创建 Alembic 迁移脚本 (`alembic/versions/c8f4a1b2d3e5_add_message_search_index.py`)
- ✅ 支持 pgvector 和 pg_trgm 扩展
- ✅ 创建 HNSW 向量索引和 GIN trigram 索引
- ✅ 更新 Docker Compose 使用 `pgvector/pgvector:pg16` 镜像

### 2. Embedding 生成 (Step 2)

- ✅ 实现 `EmbeddingService` (`app/service/embedding.py`)
- ✅ 支持单条和批量 embedding 生成
- ✅ 使用 OpenAI `text-embedding-3-large` (3072 维)
- ✅ 文本提取和预处理函数

### 3. 混合搜索引擎 (Step 3)

- ✅ 实现 `SearchProvider` 抽象接口 (`app/service/search/provider.py`)
- ✅ 实现 `MessageSearchProvider` (`app/service/search/message_provider.py`)
- ✅ 实现 `HybridSearchEngine` (`app/service/search/engine.py`)
  - 模糊搜索 (pg_trgm)
  - 向量搜索 (pgvector)
  - RRF 融合算法
- ✅ 实现 `SearchService` 入口 (`app/service/search/search_service.py`)
- ✅ 支持多维度过滤：发送人、群名、时间范围、会话类型

### 4. 上下文检索 (Step 4)

- ✅ 实现 `ContextRetrievalService` (`app/service/context_retrieval.py`)
- ✅ Topic 模式：返回整个 topic 的所有消息
- ✅ Window 模式：返回命中消息前后 N 条消息
- ✅ 批量上下文检索优化（topic 缓存）

### 5. Agent 工具集成 (Step 5)

- ✅ 创建 `agent_user_id` ContextVar (`app/agent/tools/context.py`)
- ✅ 实现 `search_messages` 工具 (`app/agent/tools/builtin/message_search.py`)
- ✅ 实现 `get_message_context` 工具
- ✅ 在 `DeepAgentService` 中注入用户上下文
- ✅ 更新工具注册 (`app/agent/tools/builtin/__init__.py`)

### 6. 索引管线 (Step 6)

- ✅ 实现 `SearchIndexerService` (`app/service/search_indexer.py`)
  - 实时索引：消息创建时自动索引
  - 批量回填：为存量消息建立索引
  - Embedding 重试机制
  - 统计信息查询
- ✅ 集成到 `MessageService.create_message()`
- ✅ 创建批量回填脚本 (`scripts/backfill_search_index.py`)
- ✅ 创建重试脚本 (`scripts/retry_failed_embeddings.py`)

### 7. 配置参数 (Step 7)

- ✅ 在 `app/config.py` 添加所有搜索相关配置
- ✅ 支持环境变量配置
- ✅ 可调整的搜索阈值、权重、窗口大小等

## 文件结构

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
│   ├── context_retrieval.py           # [新增] 上下文检索服务
│   ├── search_indexer.py              # [新增] 索引管理服务
│   └── search/
│       ├── __init__.py                # [新增]
│       ├── provider.py                # [新增] SearchProvider 抽象
│       ├── message_provider.py        # [新增] 消息搜索 Provider
│       ├── engine.py                  # [新增] 混合搜索引擎
│       └── search_service.py          # [新增] 搜索服务入口
├── agent/
│   ├── deep_agent_service.py          # [修改] 注入 ContextVar
│   └── tools/
│       ├── context.py                 # [新增] ContextVar 定义
│       └── builtin/
│           ├── __init__.py            # [修改] 导入 message_search
│           └── message_search.py      # [新增] 搜索工具

alembic/versions/
└── c8f4a1b2d3e5_add_message_search_index.py  # [新增] 迁移脚本

scripts/
├── backfill_search_index.py           # [新增] 批量回填脚本
└── retry_failed_embeddings.py         # [新增] 重试失败的 embedding

docker-compose.yml                     # [修改] postgres → pgvector/pgvector:pg16
pyproject.toml                         # [修改] 添加 pgvector, openai 依赖
```

## 使用方法

### 1. 安装依赖

```bash
# 安装新依赖
pip install pgvector openai

# 或使用 uv
uv sync
```

### 2. 启动数据库

```bash
# 使用 Docker Compose 启动 pgvector 数据库
docker-compose up -d db
```

### 3. 运行数据库迁移

```bash
# 执行迁移创建搜索索引表
alembic upgrade head
```

### 4. 批量回填索引（可选）

```bash
# 为现有消息建立搜索索引
python scripts/backfill_search_index.py --user-id <用户UUID>

# 为特定会话建立索引
python scripts/backfill_search_index.py --user-id <用户UUID> --session-id <会话UUID>

# 重新生成所有 embeddings
python scripts/backfill_search_index.py --user-id <用户UUID> --regenerate-embeddings
```

### 5. Agent 配置

在创建 Agent 时，将搜索工具加入 tools 列表：

```json
{
    "name": "Chat Assistant",
    "system_prompt": "You are a helpful assistant. When users ask about past conversations or messages, use the search_messages tool to find relevant information.",
    "model": "gpt-4o-mini",
    "tools": ["search_messages", "get_message_context", "current_time"],
    "temperature": 0.7
}
```

### 6. 使用示例

Agent 会自动调用搜索工具：

```
用户: "张三上周说了什么关于代码审查的内容？"

Agent 自动调用:
search_messages(
    query="代码审查",
    sender="张三",
    start_date="2025-01-20",
    end_date="2025-01-26"
)

返回结果包含命中消息及其上下文
```

## 配置参数

在 `.env` 文件中配置：

```bash
# 搜索配置
SEARCH_CONTEXT_WINDOW_SIZE=5          # 上下文窗口大小
SEARCH_SYNC_EMBEDDING=true            # 是否同步生成 embedding
SEARCH_FUZZY_THRESHOLD=0.1            # 模糊搜索阈值
SEARCH_VECTOR_THRESHOLD=0.3           # 向量搜索阈值
SEARCH_FUZZY_WEIGHT=0.4               # 模糊搜索权重
SEARCH_VECTOR_WEIGHT=0.6              # 向量搜索权重
SEARCH_DEFAULT_TOP_K=20               # 默认返回结果数
```

## 搜索模式

- **fuzzy**: 纯模糊搜索（基于 pg_trgm），适合精确关键词
- **vector**: 纯向量搜索（基于 pgvector），适合语义理解
- **hybrid**: 混合搜索（默认），结合两者优势

## 性能特点

- **模糊搜索**: 10 万条 < 50ms（GIN 索引）
- **向量搜索**: 10 万条 < 20ms（HNSW 索引）
- **混合搜索**: ~100ms（纯文本）/ ~300ms（含 embedding API）
- **索引成本**: ~$0.0000065 / 条消息（OpenAI embedding）

## 扩展性

系统采用 Provider 模式设计，可轻松扩展到其他内容类型：

1. 创建新的索引表（如 `document_search_index`）
2. 实现新的 `SearchProvider`（如 `DocumentSearchProvider`）
3. 在 `SearchService` 中添加新方法
4. 注册新的 Agent Tool

无需修改核心搜索引擎和 embedding 服务。

## 注意事项

1. **OpenAI API Key**: 需要配置 `OPENAI_API_KEY` 才能生成 embeddings
2. **数据库扩展**: 确保 PostgreSQL 安装了 `pgvector` 扩展
3. **索引时机**: 新消息会自动索引，存量消息需手动运行回填脚本
4. **失败重试**: 可设置定时任务运行 `retry_failed_embeddings.py`
5. **内存占用**: 10 万条消息约需 1.2GB 内存（HNSW 索引）

## 下一步

- [ ] 添加搜索 API 端点（如需要对外暴露）
- [ ] 实现异步 embedding 生成（后台任务队列）
- [ ] 添加搜索结果高亮显示
- [ ] 实现搜索历史和热门查询统计
- [ ] 扩展到文档、活动等其他内容类型

## 参考文档

完整设计文档位于 `docs/message-search/` 目录：

- `00-overview.md` - 总体概述
- `01-database-schema.md` - 数据库设计
- `02-embedding-pipeline.md` - Embedding 管线
- `03-search-service.md` - 搜索服务
- `04-context-retrieval.md` - 上下文检索
- `05-tool-design.md` - Agent 工具设计
- `06-indexing-pipeline.md` - 索引管线
- `07-configuration.md` - 配置调优
