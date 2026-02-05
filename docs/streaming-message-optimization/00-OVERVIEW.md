# 流式消息处理优化方案

## 概述

本文档描述前端处理 AI 流式消息的优化方案，解决当前实现中 tool_call、tool_result、error 等消息类型未正确入库的问题。

## 文档结构

1. [00-OVERVIEW.md](./00-OVERVIEW.md) - 概述与问题分析
2. [01-DATA-MODEL.md](./01-DATA-MODEL.md) - 数据模型设计
3. [02-BACKEND-CHANGES.md](./02-BACKEND-CHANGES.md) - 后端改动
4. [03-FRONTEND-CHANGES.md](./03-FRONTEND-CHANGES.md) - 前端改动
5. [04-IMPLEMENTATION-CHECKLIST.md](./04-IMPLEMENTATION-CHECKLIST.md) - 实施检查清单

---

## 1. 问题分析

### 1.1 当前流式事件类型

后端 `DeepAgentService.chat_stream()` 产生以下事件类型：

| 事件类型 | 数据结构 | 说明 |
|---------|----------|------|
| `message` | `{content: string}` | AI 文本输出片段 |
| `tool_call` | `{name: string, args: object}` | 工具调用开始 |
| `tool_result` | `{name: string, result: string}` | 工具执行结果 |
| `done` | `{status: string}` | 流式完成 |
| `error` | `{error: string}` | 错误信息 |

### 1.2 当前实现问题

#### 后端问题

**文件**: `app/router/v1/agent_chat.py`

```python
# 当前实现：只保存最终文本
if full_response:
    await _save_message(
        db_stream,
        current_user.id,
        topic.id,
        "assistant",
        "".join(full_response),  # 只有文本内容
    )
```

**问题**：
- ❌ `tool_call` 事件未入库
- ❌ `tool_result` 事件未入库
- ❌ `error` 事件未入库
- ❌ 无法追溯 AI 的工具调用历史
- ❌ 调试和审计困难

#### 前端问题

**文件**: `frontend/src/store/chat.ts`

```typescript
// 当前实现：tool_call/tool_result 只用于 UI 显示
case 'tool_call':
    set(() => ({
        activeToolCall: { name, args },  // 仅 UI 状态
    }));
    break;

case 'error':
    set(() => ({
        streamError: event.data.error,  // 仅 UI 状态
    }));
    break;
```

**问题**：
- ❌ tool_call/tool_result 未添加到消息历史
- ❌ error 未记录到消息中
- ❌ 刷新页面后工具调用历史丢失
- ❌ 无法展示完整的 AI 推理过程

### 1.3 期望行为

1. **完整记录**：所有 AI 交互事件（文本、工具调用、结果、错误）都应持久化
2. **可追溯**：用户可以查看 AI 的完整推理过程，包括调用了哪些工具
3. **可恢复**：刷新页面后能恢复完整的对话历史
4. **可分析**：便于后续分析 AI 的工具使用模式和错误情况

---

## 2. 方案概述

### 2.1 核心思路

**单消息多 Part 模式**：一次 AI 回复作为一个 Message，不同类型的内容作为不同的 MessagePart。

```
Message (role=assistant)
├── MessagePart (type=tool_call, content={name, args, call_id})
├── MessagePart (type=tool_result, content={name, result, call_id})
├── MessagePart (type=text, content="AI 的文本回复")
└── MessagePart (type=error, content={error, timestamp})  // 如有错误
```

### 2.2 设计决策

| 决策点 | 选择 | 理由 |
|-------|------|------|
| tool_call 存储方式 | 作为 MessagePart | 保持单次回复完整性，查询简单 |
| error 存储方式 | 作为 MessagePart | 支持部分成功的回复 |
| 前端展示 | 折叠式工具调用记录 | 用户可按需查看详情 |
| 入库时机 | 流式完成后批量入库 | 减少 DB 写入，保证一致性 |

### 2.3 方案优势

| 对比维度 | 当前方案 | 优化方案 |
|---------|---------|---------|
| 数据完整性 | 只有文本 | 完整记录所有事件 |
| 查询效率 | - | 单次查询获取完整回复 |
| 时序关系 | 丢失 | 通过 part 顺序保留 |
| 兼容性 | - | 向后兼容现有数据 |

### 2.4 涉及改动

| 层级 | 改动范围 |
|-----|---------|
| **数据库** | Message 表新增 `message_str` 字段 |
| **常量定义** | 扩展 MessagePartType 常量 |
| **工具函数** | 新增 `parts_to_message_str()` 纯文本生成 |
| **后端** | `_save_message` 支持多 Part + message_str |
| **前端** | store 处理逻辑、消息渲染组件 |
| **API Schema** | MessagePart type 枚举扩展 |

### 2.5 message_str 字段说明

Message 表新增 `message_str` 字段，用于存储纯文本内容：

- **用途**：全文检索、统一处理（摘要、导出等）
- **生成时机**：保存消息时同步生成
- **生成规则**：
  - `text` → 直接使用内容
  - `thinking` → `[思考: {前50字}...]`
  - `tool_call` → `[调用工具: {name}]`
  - `tool_result` → `[工具结果: {name}]`
  - `error` → `[错误: {message}]`

---

## 3. 数据流概览

### 3.1 流式处理流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (agent_chat.py)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User message saved                                           │
│        ↓                                                         │
│  2. agent_service.chat_stream()                                  │
│        ↓                                                         │
│  3. Collect events in memory:                                    │
│     - tool_calls: [{name, args, call_id, timestamp}]            │
│     - tool_results: [{name, result, call_id, timestamp}]        │
│     - text_chunks: [string]                                      │
│     - errors: [{error, timestamp}]                               │
│        ↓                                                         │
│  4. Yield SSE events to frontend (real-time)                     │
│        ↓                                                         │
│  5. On stream complete: batch save all parts                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ SSE
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (chat.ts)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Create temp AI message with empty parts                      │
│        ↓                                                         │
│  2. Process events:                                              │
│     - message: append to streamingContent                        │
│     - tool_call: add to pendingParts, show indicator            │
│     - tool_result: add to pendingParts, hide indicator          │
│     - error: add to pendingParts, show error                    │
│        ↓                                                         │
│  3. Update temp message parts for UI                             │
│        ↓                                                         │
│  4. On done: reload from API to get real IDs                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 消息结构示例

一次包含工具调用的 AI 回复：

```json
{
  "id": "msg_abc123",
  "role": "assistant",
  "parts": [
    {
      "id": "part_1",
      "type": "tool_call",
      "content": "{\"name\":\"search\",\"args\":{\"query\":\"weather\"},\"call_id\":\"call_1\"}",
      "metadata_": {"timestamp": "2024-01-01T10:00:00Z"}
    },
    {
      "id": "part_2",
      "type": "tool_result",
      "content": "{\"name\":\"search\",\"result\":\"Sunny, 25°C\",\"call_id\":\"call_1\"}",
      "metadata_": {"timestamp": "2024-01-01T10:00:01Z"}
    },
    {
      "id": "part_3",
      "type": "text",
      "content": "根据搜索结果，今天天气晴朗，气温25°C。",
      "metadata_": {}
    }
  ]
}
```

---

## 4. 兼容性说明

### 4.1 数据兼容

- 现有消息数据无需迁移
- 老消息只有 `type=text` 的 Part，正常展示
- 新消息可能有多种类型的 Part

### 4.2 API 兼容

- MessagePart type 字段扩展为支持更多值
- 不破坏现有 API 契约
- 老版本前端忽略未知的 part type

### 4.3 前端兼容

- 新增 part type 的渲染逻辑
- 未知 type 默认不渲染或显示为 JSON

---

## 5. 后续文档

- [01-DATA-MODEL.md](./01-DATA-MODEL.md) - 详细数据模型设计
- [02-BACKEND-CHANGES.md](./02-BACKEND-CHANGES.md) - 后端代码改动
- [03-FRONTEND-CHANGES.md](./03-FRONTEND-CHANGES.md) - 前端代码改动
- [04-IMPLEMENTATION-CHECKLIST.md](./04-IMPLEMENTATION-CHECKLIST.md) - 实施检查清单
