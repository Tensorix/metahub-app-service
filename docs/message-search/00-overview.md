# 消息混合搜索系统 - 总体概述

## 1. 目标

为所有 PM（私聊）和 Group（群聊）消息构建统一的混合搜索索引，**作为 Agent 内置工具**，用于检索信息辅助回答用户问题。

支持能力：
1. **模糊搜索 (Fuzzy Search)**：基于 `pg_trgm` 的 trigram 相似度匹配，适用于拼写容错、部分关键词匹配
2. **向量检索 (Vector Search)**：基于 `pgvector` + 可插拔 Embedding 模型的语义搜索
3. **结构化过滤**：按发送人、按群名/会话名、按时间段、按会话类型过滤
4. **父子上下文检索 (Parent-Child Retrieval)**：命中消息后返回其上下文环境
5. **多模型支持**：通过 Embedding Provider 抽象层支持 OpenAI、本地模型、Cohere 等任意 embedding 提供商

## 2. 使用场景

**这不是开放 API**，而是 Agent 的 built-in tool。典型场景：

```
用户: "上次张三在技术群说的那个部署方案是什么？"
       │
       ▼
Agent 调用 search_messages 工具
  → query="部署方案", sender="张三", session_type="group"
       │
       ▼
工具返回命中消息 + 上下文
       │
       ▼
Agent 基于检索结果组织回答
```

## 3. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 模糊搜索 | PostgreSQL `pg_trgm` | 语言无关，中英文混合友好，不需要额外分词器 |
| 向量存储 | PostgreSQL `pgvector` (halfvec) | 复用现有 PG 基础设施，halfvec 存储减半，运维简单 |
| 向量类型 | `halfvec`（无维度限制） | float16 存储减半，精度损失 < 0.1%，HNSW 支持到 4000 维 |
| 嵌入模型 | 可插拔 Provider（默认 OpenAI `text-embedding-3-large`） | 支持运行时切换，不绑定单一提供商 |
| 混合排序 | RRF (Reciprocal Rank Fusion) | 融合多路检索结果的标准方法 |
| 工具注册 | `ToolRegistry.register()` | 与现有 agent tools 体系一致 |
| 模型管理 | 代码注册表 + `embedding_config` 表 | 索引由 Alembic 管理，切换由 API 控制 |

## 4. 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Agent (DeepAgentService)                   │
│                                                              │
│  用户提问 → LLM 决策 → 调用 search_messages 工具              │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│              Built-in Tool Layer                             │
│  ┌────────────────────────▼─────────────────────────────┐    │
│  │  search_messages(query, sender, group, time, ...)    │    │
│  │  get_message_context(message_id)                     │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│              Service Layer                                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐      │
│  │  Fuzzy    │  │  Vector  │  │  Context Retrieval    │      │
│  │  Search   │  │  Search  │  │  (Parent-Child)       │      │
│  │ (pg_trgm) │  │(pgvector)│  │                       │      │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────┘      │
│       └──────┬───────┘                     │                 │
│              ▼                             │                 │
│     RRF Score Fusion ──► Results ◄─────────┘                 │
├──────────────────────────────────────────────────────────────┤
│              Embedding Provider Layer                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  EmbeddingService (dispatch)                          │    │
│  │    ├── OpenAIProvider   (text-embedding-3-*)          │    │
│  │    ├── HTTPProvider     (Ollama / TEI / vLLM)         │    │
│  │    └── (可扩展)                                       │    │
│  │                                                       │    │
│  │  EmbeddingModelConfig 注册表  ←  embedding_config 表   │    │
│  └──────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│              Indexing Pipeline                                │
│  ┌──────────────┐  ┌───────────────────┐                     │
│  │  Real-time    │  │  Batch Backfill   │                     │
│  │  (on create)  │  │  (existing data)  │                     │
│  └──────────────┘  └───────────────────┘                     │
├──────────────────────────────────────────────────────────────┤
│              PostgreSQL (pgvector halfvec + pg_trgm)          │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  message_search_index (文本 + 元数据，无 embedding)    │    │
│  │      ↓ 1:1 FK                                        │    │
│  │  message_embedding (单表多模型，halfvec 无维度限制)     │    │
│  │    ├── HNSW partial idx: openai-3-large  halfvec(3072)│    │
│  │    ├── HNSW partial idx: openai-3-small  halfvec(1536)│    │
│  │    └── HNSW partial idx: bge-m3          halfvec(1024)│    │
│  │                                                       │    │
│  │  embedding_config (活跃模型配置)                        │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## 5. 核心设计：单表多模型

```
message_search_index (文本 + 元数据，无 embedding)
    ↓ 1:1 FK
message_embedding (单表，halfvec 列不指定维度)
    ├── HNSW partial index WHERE model_id='openai-3-large'  → halfvec(3072)
    ├── HNSW partial index WHERE model_id='openai-3-small'  → halfvec(1536)
    └── HNSW partial index WHERE model_id='bge-m3'          → halfvec(1024)
```

- **一张 embedding 表**存所有模型的数据，列类型 `halfvec`（无维度）
- **每模型一个 HNSW 部分索引**，统一 `halfvec_cosine_ops`，由 Alembic 创建
- 存储减半（float16），精度损失 < 0.1%，对相似度搜索可忽略
- 运行时切换模型 = 更新 config + re-embed（纯 DML）
- 添加新模型 = 代码注册 + Alembic 迁移加索引（部署操作）

## 6. 搜索过滤维度

| 维度 | 工具参数 | 索引字段 | 说明 |
|------|---------|---------|------|
| 关键词/语义 | `query` | `content_text` + `embedding` | 模糊 + 向量混合搜索 |
| 发送人 | `sender` | `sender_name` | 按发送者名称过滤 |
| 群名/会话名 | `group_name` | `session_name` | 按群名或私聊会话名过滤 |
| 时间段 | `start_date`, `end_date` | `message_created_at` | 按消息时间范围过滤 |
| 会话类型 | `session_type` | `session_type` | pm / group / all |
| 限定会话 | `session_id` | `session_id` | 在特定会话内搜索 |

## 7. 父子上下文检索策略

```
命中消息 (hit_message)
        │
        ▼
  message.topic_id 是否存在？
        │
   ┌────┴────┐
   │ YES     │ NO
   ▼         ▼
返回整个    返回前后 N 条消息
topic 的    (N 由配置参数决定，
所有消息    默认 N=5)
```

## 8. 模型切换流程

```
管理员调用 POST /api/admin/embedding/switch
  { "category": "message", "model_id": "openai-3-small" }
        │
        ▼
1. 校验 model_id 在注册表中存在且 HNSW 索引已建
2. 更新 embedding_config (category → new_model_id)
3. 后台任务:
   a. DELETE FROM message_embedding WHERE model_id != 'new_model_id'
   b. 批量读取 message_search_index.content_text
   c. 调用新模型 API 生成 embedding
   d. INSERT INTO message_embedding
4. 全程模糊搜索不受影响
5. 向量搜索在 re-embed 完成前降级
```

## 9. 添加新模型的流程

```
1. [代码] 在 EMBEDDING_MODELS 注册表增加新模型配置
2. [代码] 创建 Alembic 迁移: 添加 HNSW 部分索引
3. [部署] alembic upgrade head
4. [运行时] API 切换到新模型
```

## 10. 实现步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| Step 1 | `01-database-schema.md` | 数据库 schema 设计与迁移脚本 |
| Step 2 | `02-embedding-pipeline.md` | Embedding Provider 层与生成管线 |
| Step 3 | `03-search-service.md` | 混合搜索服务实现（含结构化过滤） |
| Step 4 | `04-context-retrieval.md` | 父子上下文检索实现 |
| Step 5 | `05-tool-design.md` | Agent 内置工具设计与上下文注入 |
| Step 6 | `06-indexing-pipeline.md` | 实时索引 + 批量回填 + 模型切换 API |
| Step 7 | `07-configuration.md` | 配置参数与调优 |

## 11. 数据流

### 写入流（新消息）
```
MessageService.create_message()
        │
        ▼
  After commit hook
        │
        ▼
  IndexingService.index_message(message)
        │
        ├─► 提取 text parts → 拼接 content_text
        ├─► 写入 message_search_index（文本 + 元数据）
        ├─► 从 embedding_config 获取当前活跃模型
        ├─► 调用对应 Provider → 生成 embedding
        └─► 写入 message_embedding（model_id + halfvec 向量）
```

### 查询流（Agent 工具调用）
```
Agent LLM 决策调用 search_messages(query="部署方案", sender="张三")
        │
        ▼
  tool_context (ContextVar) 提供 user_id + db_session
        │
        ▼
  SearchService.search(query, filters)
        │
        ├─► 从 embedding_config 获取活跃 model_id
        ├─► 结构化过滤 (sender, group, time)
        ├─► Fuzzy Search (pg_trgm on message_search_index)  → ranked_list_1
        ├─► Vector Search (JOIN message_embedding + dynamic cast) → ranked_list_2
        │
        ▼
  RRF Fusion → Top-K results
        │
        ▼
  ContextRetrievalService.get_context(results)
        │
        ▼
  格式化为 LLM 可读的文本字符串 → 返回给 Agent
```

## 12. 参考资料

- [pgvector README - 无维度列 + 表达式索引](https://github.com/pgvector/pgvector/blob/master/README.md)
- [pgvector FAQ: > 2000 维索引方案](https://github.com/pgvector/pgvector#frequently-asked-questions)
