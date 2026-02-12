# Agent Chat 后端事件协议重构说明（面向客户端）

本文档用于说明本次后端改动中，**流式事件协议**从 `tool/subagent` 分散事件迁移到统一 `operation` 事件模型的变化，帮助各客户端（Web/桌面/移动端/SDK）快速完成适配。

## 1. 改动目标

本次重构主要解决并行场景下的关联错配问题：

- 旧方案中，`tool_call -> tool_result` 在并行时容易错绑（单活动调用变量）。
- `subagent_start -> subagent_end` 与 tool 流程是两套模型，客户端状态管理复杂。

新方案统一为 `operation_start/operation_end`，并使用稳定主键 `op_id` 贯穿全链路，支持：

- 并行 tool 调用
- 并行 subagent 调用
- 乱序完成（B 先于 A 结束）
- 取消/失败语义统一

---

## 2. 影响范围

后端改动涉及：

- `app/agent/deep_agent_service.py`
- `app/router/v1/agent_chat.py`
- `app/schema/agent_chat.py`

对外接口影响：

- SSE: `POST /api/v1/sessions/{session_id}/chat`
- WebSocket: `WS /api/v1/sessions/{session_id}/chat/ws`

---

## 3. 事件协议变化

### 3.1 旧事件（已移除）

- `tool_call`
- `tool_result`
- `subagent_start`
- `subagent_end`

### 3.2 新事件（统一模型）

- `operation_start`
- `operation_end`

`message / thinking / done / error` 保持存在。

---

## 4. 新事件字段定义

### 4.1 `operation_start`

```json
{
  "event": "operation_start",
  "data": {
    "op_id": "tool_abc123",
    "op_type": "tool",
    "name": "search_messages",
    "args": { "query": "foo" },
    "started_at": "2026-02-12T09:00:00.123456+00:00"
  }
}
```

字段说明：

- `op_id`：操作唯一键（关键关联字段）
- `op_type`：`tool` 或 `subagent`
- `name`：工具名或子代理名
- `args`：仅 `tool` 常用
- `description`：仅 `subagent` 常用
- `started_at`：RFC3339/ISO8601 时间戳

### 4.2 `operation_end`

```json
{
  "event": "operation_end",
  "data": {
    "op_id": "tool_abc123",
    "op_type": "tool",
    "name": "search_messages",
    "result": "...",
    "success": true,
    "duration_ms": 428,
    "status": "success",
    "ended_at": "2026-02-12T09:00:00.551234+00:00"
  }
}
```

字段说明：

- `op_id`：与 start 一一对应
- `success`：布尔执行结果
- `status`：`success | error | cancelled`
- `duration_ms`：毫秒耗时
- `result`：序列化后的输出文本

---

## 5. 语义细节与并行行为

1. `op_id` 是唯一关联键，客户端应以 `op_id` 追踪状态。
2. 多个 operation 可以并行开始、交错结束（顺序不保证）。
3. `subagent` 与 `tool` 仅在 `op_type` 上区分，状态机一致。
4. 缺失 run_id 的极端情况：后端会兜底生成 `op_id`，并记录 warning，事件不会丢失。

---

## 6. 取消与错误语义

### 6.1 用户取消

当客户端调用 stop 或中断流：

- 后端会将所有未结束 operation 补齐为 `status=cancelled`（用于持久化一致性）。
- SSE 最终仍会收到 `done`，`data.status` 为 `cancelled`。

### 6.2 执行错误

- operation 级错误通过 `operation_end` 的 `success=false/status=error` 体现。
- 流级错误仍可通过 `error` 事件输出。

---

## 7. 持久化与历史消息兼容

数据库 `message_part` 类型未改变：

- `tool_call`
- `tool_result`
- `subagent_call`

仅 `content` JSON 内部字段更新为 `op_id`（替代旧 `call_id` 语义）。

建议客户端解析器同时兼容：

- 新字段：`op_id`
- 历史字段：`call_id`（回放旧数据）

---

## 8. 客户端迁移建议（最小改造）

1. 事件订阅层：
   - 删除旧分支 `tool_call/tool_result/subagent_start/subagent_end`
   - 新增 `operation_start/operation_end`

2. 状态管理层：
   - 使用 `Map<op_id, ActiveOperation>` 替代单 `activeToolCall`
   - 支持并行与乱序完成

3. UI 层：
   - 运行中列表按 `op_id` 渲染
   - 完成后转历史卡片（tool/subagent 都可复用统一组件）

---

## 9. 旧事件到新事件映射

- `tool_call` -> `operation_start` (`op_type=tool`)
- `tool_result` -> `operation_end` (`op_type=tool`)
- `subagent_start` -> `operation_start` (`op_type=subagent`)
- `subagent_end` -> `operation_end` (`op_type=subagent`)

---

## 10. 客户端验收清单

建议至少覆盖以下场景：

1. 并行 A/B tool：A start, B start, B end, A end
2. 并行 A/B subagent：A start, B start, A end, B end
3. tool + subagent 混合并行
4. 中途取消：所有运行中任务能落 `cancelled`
5. 历史回放：旧 `call_id` 数据仍可正常显示

---

## 11. 常见问题（FAQ）

### Q1: 为什么不继续用 `call_id/run_id`？

旧字段来源与职责不统一，客户端经常需要维护多套映射。`op_id` 作为统一抽象能减少状态复杂度，并直接覆盖 tool/subagent 两类操作。

### Q2: 是否需要数据库迁移？

不需要。表结构不变，仅 part content JSON 字段的推荐键从 `call_id` 迁移为 `op_id`。

### Q3: 是否会影响非流式接口？

不影响。非流式 `chat` 返回结构未改变。

