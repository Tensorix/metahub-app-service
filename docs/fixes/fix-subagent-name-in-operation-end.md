# 修复：SubAgent 完成后显示 "task" 而非实际名称

## 问题描述

SubAgent 执行完成后，卡片显示的名称是 `"task"` 而不是实际的 SubAgent 名称（如 `"researcher"`）。

## 根因分析

后端 `deep_agent_service.py` 在发送 SSE 事件时，`operation_start` 和 `operation_end` 使用了**不同来源**的 `name` 字段：

```python
# operation_start — name 是 subagent 的实际名称 ✅
subagent_name = tool_input.get("subagent_type", "unknown")  # e.g. "researcher"
yield {
    "event": "operation_start",
    "data": {
        "name": subagent_name,  # ✅ 正确: "researcher"
        ...
    },
}

# operation_end — name 是 LangGraph 的工具名 ❌
yield {
    "event": "operation_end",
    "data": {
        "name": event.get("name", "task"),  # ❌ 错误: "task"（LangGraph tool name）
        ...
    },
}
```

**后端数据库不受影响**——`StreamingCollector.add_operation_end()` 通过 `_active_operations` 正确使用了 `operation_start` 时保存的名称。问题**仅出在 SSE 事件流**中。

Web 前端 `store/chat.ts` 在处理 `operation_end` 时，直接使用了事件中的 `event.data.name`（值为 `"task"`），没有优先使用 `operation_start` 时保存在 `activeOperations` 中的名称。

## 需要修改的文件

`frontend/src/store/chat.ts`

## 修复方法

### 位置 1: subagentPart 的 name（约第 844-855 行）

**修改前：**
```typescript
const subagentPart = {
  type: 'subagent_call' as const,
  content: JSON.stringify({
    op_id: opId,
    name: event.data.name,                    // ❌ "task"
    description: existing?.description || '',
    result: event.data.result || '',
    duration_ms: event.data.duration_ms ?? 0,
    status: event.data.status,
  }),
  metadata: { timestamp: new Date().toISOString() },
};
```

**修改后：**
```typescript
const subagentPart = {
  type: 'subagent_call' as const,
  content: JSON.stringify({
    op_id: opId,
    name: existing?.name || event.data.name || 'unknown',  // ✅ 优先用 operation_start 的名称
    description: existing?.description || '',
    result: event.data.result || '',
    duration_ms: event.data.duration_ms ?? 0,
    status: event.data.status,
  }),
  metadata: { timestamp: new Date().toISOString() },
};
```

### 位置 2: activeOperations 更新的 name（约第 788 行）

这行也有同样问题——`event.data.name` 优先级高于 `existing?.name`：

**修改前：**
```typescript
name: event.data.name || existing?.name || 'unknown',
```

**修改后：**
```typescript
name: existing?.name || event.data.name || 'unknown',
```

## 原理

`existing` 变量来自 `activeOperations.get(opId)`，保存的是 `operation_start` 时的数据（包含正确的 subagent 名称）。修改后优先使用 `existing?.name`，只在 `existing` 不存在时才 fallback 到 `event.data.name`。

## 验证方法

1. 发送一条会触发 SubAgent 调用的消息
2. 等待 SubAgent 执行完成
3. 确认完成后的卡片显示的是 SubAgent 实际名称（如 "researcher"）而非 "task"
