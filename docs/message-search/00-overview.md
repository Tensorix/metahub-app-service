# 消息混合搜索系统 - 总体概述

## 1. 目标

为所有 PM（私聊）和 Group（群聊）消息构建统一的混合搜索索引，**作为 Agent 内置工具**，用于检索信息辅助回答用户问题。

支持能力：
1. **模糊搜索 (Fuzzy Search)**：基于 `pg_trgm` 的 trigram 相似度匹配，适用于拼写容错、部分关键词匹配
2. **向量检索 (Vector Search)**：基于 `pgvector` + OpenAI `text-embedding-3-large` 的语义搜索
3. **结构化过滤**：按发送人、按群名/会话名、按时间段、按会话类型过滤
4. **父子上下文检索 (Parent-Child Retrieval)**：命中消息后返回其上下文环境

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
| 向量存储 | PostgreSQL `pgvector` | 复用现有 PG 基础设施，运维简单 |
| 嵌入模型 | OpenAI `text-embedding-3-large` (3072 dims) | 已有 OpenAI 集成，高精度 |
| 混合排序 | RRF (Reciprocal Rank Fusion) | 融合多路检索结果的标准方法 |
| 工具注册 | `ToolRegistry.register()` | 与现有 agent tools 体系一致 |

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
│              Indexing Pipeline                                │
│  ┌──────────────┐  ┌───────────────────┐                     │
│  │  Real-time    │  │  Batch Backfill   │                     │
│  │  (on create)  │  │  (existing data)  │                     │
│  └──────────────┘  └───────────────────┘                     │
├──────────────────────────────────────────────────────────────┤
│              PostgreSQL (pgvector + pg_trgm)                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              message_search_index                     │    │
│  │  content_text | embedding(3072) | session_name       │    │
│  │  sender_name | session_type | topic_id | user_id     │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## 5. 搜索过滤维度

| 维度 | 工具参数 | 索引字段 | 说明 |
|------|---------|---------|------|
| 关键词/语义 | `query` | `content_text` + `embedding` | 模糊 + 向量混合搜索 |
| 发送人 | `sender` | `sender_name` | 按发送者名称过滤 |
| 群名/会话名 | `group_name` | `session_name` | 按群名或私聊会话名过滤 |
| 时间段 | `start_date`, `end_date` | `message_created_at` | 按消息时间范围过滤 |
| 会话类型 | `session_type` | `session_type` | pm / group / all |
| 限定会话 | `session_id` | `session_id` | 在特定会话内搜索 |

## 6. 父子上下文检索策略

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

## 7. 实现步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| Step 1 | `01-database-schema.md` | 数据库 schema 设计与迁移脚本 |
| Step 2 | `02-embedding-pipeline.md` | Embedding 生成管线 |
| Step 3 | `03-search-service.md` | 混合搜索服务实现（含结构化过滤） |
| Step 4 | `04-context-retrieval.md` | 父子上下文检索实现 |
| Step 5 | `05-tool-design.md` | Agent 内置工具设计与上下文注入 |
| Step 6 | `06-indexing-pipeline.md` | 实时索引 + 批量回填 |
| Step 7 | `07-configuration.md` | 配置参数与调优 |

## 8. 数据流

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
        ├─► 生成 trgm index（自动，由 pg_trgm 处理）
        └─► 调用 OpenAI API → 生成 embedding → 写入 message_search_index
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
        ├─► 结构化过滤 (sender, group, time)
        ├─► Fuzzy Search (pg_trgm)   → ranked_list_1
        ├─► Vector Search (pgvector) → ranked_list_2
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
