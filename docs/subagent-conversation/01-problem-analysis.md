# SubAgent 对话可见性 — 问题分析

## 1. 背景

项目已完成 Agent/SubAgent 统一抽象（见 `docs/agent-unification/`）和 deepagents 迁移（见 `docs/deepagents-migration/`）。当前 SubAgent 在数据模型和运行时配置上已经健全，但存在 **对话层面的可见性缺失**：前端和后端均无法区分主 Agent 行为和 SubAgent 行为。

## 2. 当前架构回顾

### 运行时调用链

```
用户消息
  → agent_chat.py (SSE/WS 入口)
    → AgentFactory.build_agent_config(agent)  # 加载 Agent + mounted_subagents
      → DeepAgentService.chat_stream()
        → create_deep_agent(subagents=[SubAgent(...)])
          → astream_events(version="v2")
            → 事件流 → SSE 转发给前端
```

### deepagents 库内部机制

SubAgent 调用发生在 `task` 工具内部（`deepagents/subagents.py`）：

```python
# deepagents 内部实现（不可修改）
def task(description: str, subagent_type: str, runtime: ToolRuntime):
    subagent = subagent_graphs[subagent_type]

    # 关键：上下文隔离
    subagent_state = {k: v for k, v in runtime.state.items()
                      if k not in {"messages", "todos", "structured_response"}}
    subagent_state["messages"] = [HumanMessage(content=description)]  # 全新上下文

    # 关键：同步调用，非流式
    result = subagent.invoke(subagent_state)

    return Command(update={
        "messages": [ToolMessage(final_message, tool_call_id=tool_call_id)]
    })
```

### 事件流特征

父 Agent 的 `astream_events` 输出中，SubAgent 调用表现为：

```
on_tool_start  name="task"  input={"description": "...", "subagent_type": "researcher"}
  │
  │  ← SubAgent.invoke() 同步阻塞，无中间事件
  │
on_tool_end    name="task"  output=ToolMessage(result)
```

**SubAgent 执行是一个黑盒** — 使用 `.invoke()` 而非 `.astream_events()`，父 Agent 流中看不到 SubAgent 的内部工具调用或推理。

## 3. 问题清单

### P0 — SubAgent 活动不可识别

**位置**: `app/agent/deep_agent_service.py:469-543`

当前 `chat_stream()` 处理事件时，`task` 工具与其他工具完全等同处理：

```python
elif event_type == "on_tool_start":
    tool_name = event.get("name", "unknown")
    # task 工具和 read_file/grep 等一视同仁
    yield {"event": "tool_call", "data": {"name": tool_name, "args": tool_input}}
```

**后果**: 前端收到的 SSE 事件中，SubAgent 委派显示为普通 `tool_call: task`，用户无法理解发生了什么。

### P0 — 消息存储无 SubAgent 语义

**位置**: `app/constants/message.py` (MessagePartType), `app/router/v1/agent_chat.py` (StreamingCollector)

- `MessagePartType` 没有 SubAgent 相关类型
- `StreamingCollector` 把 `task` 工具调用存为普通 `tool_call` Part
- 历史消息无法区分"Agent 调用了 grep"和"Agent 委派了 SubAgent"

### P1 — 前端无差异化渲染

**位置**: `frontend/src/components/chat/AIMessageList.tsx:91-153`

`organizedParts` 只识别四种类型：

```typescript
type: 'thinking' | 'tool_pair' | 'text' | 'error'
```

SubAgent 的 `task` 调用被当作 `tool_pair` 渲染，与普通工具调用卡片完全一样。

### P1 — 流式过程无 SubAgent 状态指示

用户发送消息后，如果 Agent 委派了 SubAgent，界面无任何反馈。SubAgent 可能执行数秒甚至数十秒（内部调用多个工具），用户只看到空白等待。

### P2 — SSE 事件类型不够语义化

当前 SSE 事件只有：`message | thinking | tool_call | tool_result | done | error`。缺少表达 SubAgent 生命周期的事件。

## 4. 与 LangChain 最佳实践的差距

| 最佳实践 | 当前状态 | 差距 |
|----------|---------|------|
| SubAgent 对话上下文隔离 | ✅ deepagents 已实现 | 无 |
| SubAgent 只返回最终结果 | ✅ ToolMessage 机制 | 无 |
| UI 显示 Supervisor 决策 | ❌ 不区分 task 工具 | **需实现** |
| UI 隐藏 SubAgent 内部细节 | ✅ invoke() 天然黑盒 | 无 |
| UI 提供可展开的详情 | ❌ 无折叠卡片 | **需实现** |
| 流式中指示 SubAgent 状态 | ❌ 无状态指示 | **需实现** |
| SubAgent 结果存储有语义 | ❌ 存为普通 tool_call | **需实现** |

## 5. 影响范围评估

### 需修改的文件

| 文件 | 改动性质 | 预估行数 |
|------|---------|---------|
| `app/agent/deep_agent_service.py` | 事件识别与转化 | ~30 行 |
| `app/constants/message.py` | 新增常量 | 1 行 |
| `app/router/v1/agent_chat.py` | StreamingCollector 扩展 | ~40 行 |
| `frontend/src/components/chat/AIMessageList.tsx` | Part 类型处理 | ~15 行 |
| `frontend/src/components/chat/SubAgentCallPart.tsx` | 新建组件 | ~60 行 |
| `frontend/src/hooks/useAIChat.ts` | SubAgent 状态管理 | ~20 行 |
| `frontend/src/store/chat.ts` | SSE 事件处理 | ~15 行 |

### 不需修改的部分

- 数据库 schema / 迁移脚本 — 复用现有 `MessagePart`
- deepagents 库 — 在应用层解决
- Agent/SubAgent 数据模型 — 已统一，无需变更
- Agent CRUD API — 不涉及
