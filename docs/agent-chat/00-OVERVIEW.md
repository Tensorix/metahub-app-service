# Agent Chat API 总体架构概览

## 1. 项目目标

实现一个基于 LangGraph 的 Agent Chat API，具备以下能力：

- **流式响应**：SSE + WebSocket 双通道支持
- **持久化记忆**：基于 PostgreSQL 的 Checkpointer
- **工具调用**：可扩展的自定义工具框架
- **多模型支持**：通过 OpenAI 兼容接口支持 DeepSeek/OpenAI 等

## 2. 技术选型

| 组件 | 技术方案 | 说明 |
|------|----------|------|
| Agent 框架 | LangGraph | 基于 LangChain 的状态机编排 |
| LLM Gateway | OpenAI 兼容接口 | 通过 `OPENAI_BASE_URL` 配置 |
| 流式传输 | SSE + WebSocket | SSE 为主，WebSocket 可选 |
| 持久化 | langgraph-checkpoint-postgres | PostgreSQL Checkpointer |
| 前端状态 | Zustand | 扩展现有 chat store |

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  agentApi.ts        │  chat.ts (store)   │  AI Components       │
│  - SSE Client       │  - isStreaming     │  - AIMessageInput    │
│  - WebSocket Client │  - pendingMessage  │  - StreamingMessage  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend API (FastAPI)                        │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/v1/sessions/{id}/chat        (SSE 流式)              │
│  WS   /api/v1/sessions/{id}/chat/ws     (WebSocket)             │
│  POST /api/v1/sessions/{id}/chat/stop   (停止生成)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Service Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  DeepAgentService   │  AgentFactory      │  ToolRegistry        │
│  - chat_stream()    │  - create_agent()  │  - register()        │
│  - chat()           │  - get_checkpointer│  - get_tools()       │
│  - get_history()    │                    │                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LangGraph Core                              │
├─────────────────────────────────────────────────────────────────┤
│  create_react_agent │  AsyncPostgresSaver │  InMemoryStore      │
│  - ReAct 模式       │  - 状态持久化        │  - 长期记忆         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
├─────────────────────────────────────────────────────────────────┤
│  OpenAI API / DeepSeek API    │    PostgreSQL Database          │
│  (通过 OPENAI_BASE_URL 配置)   │    (Checkpointer 存储)          │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 数据流

### 4.1 SSE 流式对话流程

```
1. 用户发送消息
   POST /api/v1/sessions/{session_id}/chat
   Body: { message: "Hello", topic_id: "xxx", stream: true }

2. 后端验证
   - 验证 session 存在且 type=ai
   - 验证 session 关联了 agent_id
   - 获取 Agent 配置

3. 创建/获取 Topic
   - 如果 topic_id 为空，创建新 Topic
   - Topic 名称取消息前 30 字符

4. 保存用户消息
   - 创建 Message (role=user)
   - 创建 MessagePart (type=text)

5. 调用 Agent 流式生成
   - DeepAgentService.chat_stream()
   - 通过 astream_events() 获取事件

6. SSE 事件流
   event: message
   data: {"content": "Hello"}

   event: tool_call
   data: {"name": "search", "args": {...}}

   event: tool_result
   data: {"name": "search", "result": "..."}

   event: done
   data: {"status": "complete"}

7. 保存 AI 响应
   - 创建 Message (role=assistant)
   - 创建 MessagePart (type=text)
```

### 4.2 WebSocket 对话流程

```
1. 建立 WebSocket 连接
   WS /api/v1/sessions/{session_id}/chat/ws

2. 客户端发送消息
   {"type": "message", "content": "Hello", "topic_id": "xxx"}

3. 服务端流式响应
   {"type": "chunk", "content": "Hello"}
   {"type": "tool_call", "name": "search", "args": {...}}
   {"type": "done"}

4. 客户端停止生成
   {"type": "stop"}

5. 服务端确认停止
   {"type": "stopped"}
```

## 5. 配置设计

### 5.1 环境变量

```bash
# OpenAI 兼容配置 (已存在)
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com/v1

# Agent Chat 配置 (新增)
AGENT_MAX_ITERATIONS=50      # 最大迭代次数
AGENT_TIMEOUT=300            # 超时时间 (秒)
AGENT_DEFAULT_MODEL=gpt-4o-mini  # 默认模型
```

### 5.2 Agent 元数据配置

Agent 的模型和工具配置存储在 `Agent.metadata_` 字段：

```json
{
  "model": "deepseek-chat",
  "temperature": 0.7,
  "tools": ["search", "calculator"],
  "max_tokens": 4096
}
```

## 6. 文件结构

### 6.1 后端新增文件

```
app/
├── agent/
│   ├── __init__.py           # 模块导出
│   ├── deep_agent_service.py # 核心 Agent 服务
│   ├── factory.py            # Agent 工厂
│   └── tools/
│       ├── __init__.py       # 工具注册表导出
│       ├── registry.py       # 工具注册表
│       └── builtin/
│           ├── __init__.py
│           └── search.py     # 内置搜索工具
├── router/v1/
│   └── agent_chat.py         # API 端点
└── schema/
    └── agent_chat.py         # 请求/响应模型
```

### 6.2 前端新增文件

```
frontend/src/
├── lib/
│   └── agentApi.ts           # Agent API 客户端
├── store/
│   └── chat.ts               # 扩展 (AI 状态)
└── components/chat/
    ├── AIMessageInput.tsx    # AI 输入组件
    └── StreamingMessage.tsx  # 流式消息组件
```

## 7. 实现步骤

| Step | 文档 | 主要内容 |
|------|------|----------|
| 1 | 01-BACKEND-DEPS.md | 依赖安装、配置更新 |
| 2 | 02-BACKEND-SERVICE.md | DeepAgentService 实现 |
| 3 | 03-BACKEND-API.md | SSE/WebSocket 端点 |
| 4 | 04-BACKEND-TOOLS.md | 工具注册表和内置工具 |
| 5 | 05-FRONTEND-API.md | SSE/WebSocket 客户端 |
| 6 | 06-FRONTEND-STORE.md | Zustand store 扩展 |
| 7 | 07-FRONTEND-COMPONENTS.md | UI 组件实现 |
| 8 | 08-INTEGRATION.md | 集成测试 |
| 9 | 09-CLIENT-SDK.md | SDK 设计文档 |

## 8. 关键设计决策

### 8.1 为什么选择 LangGraph？

- **状态管理**：内置状态持久化支持
- **流式支持**：`astream_events()` 提供细粒度事件
- **工具调用**：原生支持 ReAct 模式
- **可扩展**：支持自定义 checkpointer 和 store

### 8.2 为什么用 SSE 而非纯 WebSocket？

- **简单性**：SSE 基于 HTTP，无需额外协议
- **兼容性**：浏览器原生支持，无需库
- **可靠性**：自动重连机制
- **调试**：可在浏览器 Network 面板直接查看

### 8.3 消息存储策略

- **用户消息**：发送时立即存储
- **AI 消息**：流式完成后存储完整内容
- **工具调用**：存储在 MessagePart.metadata_ 中

## 9. 错误处理

### 9.1 SSE 错误事件

```
event: error
data: {"error": "Rate limit exceeded", "code": "RATE_LIMIT"}
```

### 9.2 错误码定义

| 错误码 | 说明 |
|--------|------|
| `INVALID_SESSION` | Session 不存在或无权限 |
| `NO_AGENT` | Session 未关联 Agent |
| `AGENT_ERROR` | Agent 执行错误 |
| `RATE_LIMIT` | 请求频率超限 |
| `TIMEOUT` | 执行超时 |
| `CANCELLED` | 用户取消 |

## 10. 安全考虑

- **认证**：所有端点需要 Bearer Token
- **授权**：验证 session.user_id == current_user.id
- **输入验证**：限制消息长度 (max 10000 字符)
- **输出过滤**：不暴露内部错误详情
- **速率限制**：每用户每分钟 60 次请求
