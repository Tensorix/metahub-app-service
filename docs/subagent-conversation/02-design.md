# SubAgent 对话可见性 — 设计方案

## 1. 设计原则

```
最小侵入 · 语义清晰 · 前后端一致
```

- **不改 deepagents 库** — 在应用层通过事件识别解决，保持库升级兼容
- **不改数据库 schema** — 复用 `MessagePart`，只新增一个 type 常量
- **不创建独立会话** — SubAgent 是无状态工具调用，不是独立对话
- **三层注入** — 在事件识别、消息存储、前端渲染三个点注入 SubAgent 语义

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                    deepagents runtime                          │
│                                                                │
│  Parent Agent ──task()──→ SubAgent.invoke()                    │
│       │                        │                               │
│       │    (isolated: fresh HumanMessage only)                 │
│       │                        │                               │
│       ←── ToolMessage(result) ←┘                               │
│                                                                │
│  astream_events 输出:                                           │
│    on_tool_start("task", {subagent_type, description})         │
│    on_tool_end("task", ToolMessage)                            │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│              Layer 1: deep_agent_service.py                    │
│                                                                │
│  识别 name=="task" → 转化为语义事件:                              │
│    subagent_start {name, description}                          │
│    subagent_end   {name, result}                               │
│  其他工具 → 保持原有 tool_call / tool_result 事件                 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│              Layer 2: agent_chat.py                            │
│                                                                │
│  StreamingCollector:                                           │
│    subagent_start → 记录活跃 SubAgent 信息                      │
│    subagent_end   → 生成 MessagePart(type="subagent_call")     │
│  SSE 转发 subagent_start / subagent_end 给前端                  │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│              Layer 3: Frontend                                  │
│                                                                │
│  流式阶段: activeSubagent 状态 → 脉冲动画指示                     │
│  历史阶段: SubAgentCallPart → 可折叠/展开卡片                     │
└──────────────────────────────────────────────────────────────┘
```

## 3. Layer 1 — 后端事件识别

### 文件: `app/agent/deep_agent_service.py`

### 并行 SubAgent 支持

LLM 可以在一次回复中发出多个并行 tool_call（如同时委派 researcher 和 writer）。
LangGraph 的 ToolNode 会并发执行它们，`astream_events` 事件流会交错出现：

```
on_tool_start("task", run_id=A, input={subagent_type="researcher"})
on_tool_start("task", run_id=B, input={subagent_type="writer"})
  ↕ 并发执行中 — 事件交错
on_tool_end("task", run_id=A, output=result_1)
on_tool_end("task", run_id=B, output=result_2)
```

**关联键**: `astream_events` v2 每个事件都有 `run_id`，同一个工具调用的 start/end 共享
同一个 `run_id`。用它来匹配 start 和 end，而不是假设串行顺序。

### 改动: `chat_stream()` 方法

在事件处理循环中，识别 `task` 工具调用并转化为语义事件：

```python
async def chat_stream(self, message, thread_id, user_id=None, session_id=None):
    # ... 现有代码 ...
    async for event in agent.astream_events(...):
        event_type = event.get("event")
        event_data = event.get("data", {})
        run_id = event.get("run_id")  # ★ 关联键：匹配 start/end

        if event_type == "on_chat_model_stream":
            # 保持不变 — 流式文本
            chunk = event_data.get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                yield {"event": "message", "data": {"content": chunk.content}}

        elif event_type == "on_tool_start":
            tool_name = event.get("name", "unknown")
            tool_input = event_data.get("input", {})

            if tool_name == "task":
                # ★ SubAgent 委派 — 转化为语义事件
                subagent_name = tool_input.get("subagent_type", "unknown")
                description = tool_input.get("description", "")
                yield {
                    "event": "subagent_start",
                    "data": {
                        "run_id": run_id,      # ★ 透传 run_id
                        "name": subagent_name,
                        "description": description,
                    },
                }
            else:
                # 普通工具调用 — 保持原有逻辑
                yield {
                    "event": "tool_call",
                    "data": {"name": tool_name, "args": tool_input},
                }

        elif event_type == "on_tool_end":
            tool_name = event.get("name", "unknown")
            tool_output = event_data.get("output", "")

            if tool_name == "task":
                # ★ SubAgent 完成 — 转化为语义事件
                result_str = _safe_serialize(tool_output)
                yield {
                    "event": "subagent_end",
                    "data": {
                        "run_id": run_id,      # ★ 透传 run_id，前端用来匹配
                        "result": result_str,
                    },
                }
            else:
                # 普通工具结果 — 保持原有逻辑
                result_str = _safe_serialize(tool_output)
                yield {
                    "event": "tool_result",
                    "data": {"name": tool_name, "result": result_str},
                }
```

### 辅助函数

将现有的序列化逻辑抽取为 `_safe_serialize()`，消除重复：

```python
def _safe_serialize(value) -> str:
    """安全序列化工具输出为字符串"""
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(value)
    return str(value)
```

## 4. Layer 2 — 消息收集与存储

### 文件: `app/constants/message.py`

新增一个常量：

```python
class MessagePartType:
    TEXT = "text"
    IMAGE = "image"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    THINKING = "thinking"
    ERROR = "error"
    SUBAGENT_CALL = "subagent_call"  # ← 新增
```

### 文件: `app/router/v1/agent_chat.py`

#### StreamingCollector 扩展

**并行支持关键**: `_active_subagents` 用 `run_id` 作为键的字典，
而非单值 `_active_subagent`，从而正确追踪多个并发 SubAgent。

```python
@dataclass
class StreamingCollector:
    text_chunks: List[str] = field(default_factory=list)
    thinking_chunks: List[str] = field(default_factory=list)
    tool_calls: List[StreamingPart] = field(default_factory=list)
    tool_results: List[StreamingPart] = field(default_factory=list)
    errors: List[StreamingPart] = field(default_factory=list)
    subagent_calls: List[StreamingPart] = field(default_factory=list)
    _call_counter: int = field(default=0)
    _active_subagents: dict = field(default_factory=dict)  # ★ run_id → subagent info

    # ... 保留现有方法 ...

    def add_subagent_start(self, run_id: str, name: str, description: str) -> str:
        """记录 SubAgent 调用开始，用 run_id 作为关联键"""
        call_id = self.generate_call_id()
        self._active_subagents[run_id] = {
            "call_id": call_id,
            "name": name,
            "description": description,
            "start_time": datetime.utcnow(),
        }
        return call_id

    def add_subagent_end(self, run_id: str, result: str):
        """记录 SubAgent 调用结束，用 run_id 匹配对应的 start"""
        sa = self._active_subagents.pop(run_id, None)
        if not sa:
            return
        duration = int(
            (datetime.utcnow() - sa["start_time"]).total_seconds() * 1000
        )
        self.subagent_calls.append(StreamingPart(
            type=MessagePartType.SUBAGENT_CALL,
            content={
                "call_id": sa["call_id"],
                "name": sa["name"],
                "description": sa["description"],
                "result": result,
                "duration_ms": duration,
            },
            metadata={"timestamp": datetime.utcnow().isoformat()},
        ))

    def flush_active_subagents(self, cancel_result: str = "[已取消]"):
        """流中断时，将所有未完成的 SubAgent 调用补充关闭"""
        for run_id in list(self._active_subagents.keys()):
            self.add_subagent_end(run_id, cancel_result)

    def has_content(self) -> bool:
        """是否有任何内容"""
        return bool(
            self.text_chunks or self.thinking_chunks or
            self.tool_calls or self.tool_results or
            self.subagent_calls or self.errors
        )

    def to_parts_data(self) -> List[dict]:
        """转换为 MessagePart 创建数据列表"""
        parts = []

        # thinking
        full_thinking = self.get_full_thinking()
        if full_thinking:
            parts.append({
                "type": MessagePartType.THINKING,
                "content": full_thinking,
                "metadata_": {"timestamp": datetime.utcnow().isoformat()},
            })

        # 合并 tool_call, tool_result, subagent_call 按时间排序
        timed_parts = []
        for tc in self.tool_calls:
            timed_parts.append((tc.timestamp, tc.type, tc))
        for tr in self.tool_results:
            timed_parts.append((tr.timestamp, tr.type, tr))
        for sa in self.subagent_calls:
            timed_parts.append((sa.timestamp, sa.type, sa))
        timed_parts.sort(key=lambda x: x[0])

        for _, part_type, part in timed_parts:
            parts.append({
                "type": part_type,
                "content": json.dumps(part.content),
                "metadata_": part.metadata,
            })

        # text
        full_text = self.get_full_text()
        if full_text:
            parts.append({
                "type": MessagePartType.TEXT,
                "content": full_text,
                "metadata_": {},
            })

        # errors
        for err in self.errors:
            parts.append({
                "type": MessagePartType.ERROR,
                "content": json.dumps(err.content),
                "metadata_": err.metadata,
            })

        return parts
```

#### generate_events() 事件处理

**注意**: `subagent_start`/`subagent_end` 携带 `run_id`，用于并行关联。

```python
async def generate_events():
    collector = StreamingCollector()
    active_call_id: Optional[str] = None

    try:
        async for event in agent_service.chat_stream(...):
            event_type = event.get("event")
            event_data = event.get("data", {})

            if event_type == "message":
                collector.add_text(event_data.get("content", ""))

            elif event_type == "thinking":
                collector.add_thinking(event_data.get("content", ""))

            elif event_type == "tool_call":
                name = event_data.get("name", "")
                args = event_data.get("args", {})
                active_call_id = collector.add_tool_call(name, args)
                event_data["call_id"] = active_call_id

            elif event_type == "tool_result":
                name = event_data.get("name", "")
                result = event_data.get("result", "")
                if active_call_id:
                    collector.add_tool_result(name, result, active_call_id)
                    event_data["call_id"] = active_call_id
                    active_call_id = None

            # ★ SubAgent 事件处理 — 用 run_id 支持并行
            elif event_type == "subagent_start":
                run_id = event_data.get("run_id", "")
                name = event_data.get("name", "")
                description = event_data.get("description", "")
                sa_call_id = collector.add_subagent_start(run_id, name, description)
                event_data["call_id"] = sa_call_id

            elif event_type == "subagent_end":
                run_id = event_data.get("run_id", "")
                result = event_data.get("result", "")
                collector.add_subagent_end(run_id, result)

            elif event_type == "error":
                collector.add_error(event_data.get("error", "Unknown error"))

            # 转发 SSE 事件
            yield {"event": event_type, "data": json.dumps(event_data)}

    except asyncio.CancelledError:
        # ★ 流中断：将所有未完成的并行 SubAgent 调用补充关闭
        collector.flush_active_subagents("[已取消]")
        # ... 保存已收集内容 ...
```

### 存储的 MessagePart 示例

```json
{
  "type": "subagent_call",
  "content": "{\"call_id\":\"call_a1b2c3_1\",\"name\":\"researcher\",\"description\":\"搜索2024年大语言模型最新进展\",\"result\":\"找到以下3篇关键论文:\\n1. GPT-5 Technical Report...\\n2. Claude 3.5 Opus...\\n3. Gemini 2.0...\",\"duration_ms\":4523}",
  "metadata_": {"timestamp": "2024-01-15T10:30:00"}
}
```

## 5. Layer 3 — 前端渲染

### 5.1 API 类型定义

**文件**: `frontend/src/lib/api.ts` 或相关类型文件

```typescript
// 新增 SubAgent 调用数据类型
interface SubAgentCallData {
  call_id: string;
  name: string;
  description: string;
  result: string;
  duration_ms: number;
}
```

### 5.2 SSE 事件处理

**文件**: `frontend/src/store/chat.ts` 或 `useAIChat.ts`

用 Map 管理多个并行 SubAgent 状态，以 `call_id` 为键：

```typescript
// 状态：支持多个并行 SubAgent
activeSubagents: new Map<string, { name: string; description: string }>(),

// 事件处理
case "subagent_start":
  store.activeSubagents.set(data.call_id, {
    name: data.name,
    description: data.description,
  });
  break;

case "subagent_end":
  store.activeSubagents.delete(data.call_id);
  break;

// 流结束时清空
case "done":
  store.activeSubagents.clear();
  break;
```

### 5.3 消息 Parts 处理

**文件**: `frontend/src/components/chat/AIMessageList.tsx`

在 `organizedParts` 的 `useMemo` 中新增类型：

```typescript
const organizedParts = useMemo(() => {
  // ... 现有逻辑 ...

  for (const part of message.parts) {
    switch (part.type) {
      case 'thinking':
        result.push({ type: 'thinking', data: part });
        break;

      case 'tool_call':
        // ... 现有逻辑 ...
        break;

      case 'subagent_call':  // ★ 新增
        try {
          const saData: SubAgentCallData = JSON.parse(part.content);
          result.push({ type: 'subagent_call', data: saData });
        } catch { /* ignore */ }
        break;

      case 'text':
        result.push({ type: 'text', data: part });
        break;

      case 'error':
        result.push({ type: 'error', data: part });
        break;
    }
  }
  return result;
}, [message.parts, isAssistant]);
```

渲染部分：

```tsx
{organizedParts.map((item, index) => {
  switch (item.type) {
    // ... 现有 case ...

    case 'subagent_call':
      return (
        <SubAgentCallPart
          key={`subagent-${item.data.call_id}`}
          data={item.data}
        />
      );
  }
})}
```

### 5.4 SubAgentCallPart 组件

**文件**: `frontend/src/components/chat/SubAgentCallPart.tsx`（新建）

```tsx
import { useState } from 'react';
import { Bot, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StreamingMessage } from './StreamingMessage';

interface SubAgentCallData {
  call_id: string;
  name: string;
  description: string;
  result: string;
  duration_ms: number;
}

interface SubAgentCallPartProps {
  data: SubAgentCallData;
  isStreaming?: boolean;
}

export function SubAgentCallPart({ data, isStreaming }: SubAgentCallPartProps) {
  const [expanded, setExpanded] = useState(false);

  const durationDisplay = data.duration_ms < 1000
    ? `${data.duration_ms}ms`
    : `${(data.duration_ms / 1000).toFixed(1)}s`;

  return (
    <div className="rounded-lg border bg-muted/30 my-1 overflow-hidden">
      {/* Header - 始终可见 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-primary">{data.name}</span>
        <span className="text-xs text-muted-foreground flex-1 truncate text-left">
          {data.description}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {durationDisplay}
        </span>
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Body - 可展开 */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t">
          <div className="pt-2 text-sm">
            <StreamingMessage content={data.result} isStreaming={false} />
          </div>
        </div>
      )}
    </div>
  );
}
```

### 5.5 流式中的 SubAgent 状态指示

**文件**: `frontend/src/components/chat/AIMessageList.tsx`

在 `activeToolCall` 指示器旁添加 SubAgent 指示器。
遍历 `activeSubagents` Map 以支持并行显示：

```tsx
{/* SubAgent 执行中指示（流式） — 支持多个并行 */}
{activeSubagents.size > 0 && (
  <div className="flex gap-3">
    <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border bg-primary/10">
      <Bot className="h-4 w-4" />
    </div>
    <div className="flex flex-col gap-1 max-w-[80%]">
      {Array.from(activeSubagents.entries()).map(([callId, sa]) => (
        <div
          key={callId}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 animate-pulse"
        >
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">{sa.name}</span>
          <span className="text-xs text-muted-foreground truncate">
            {sa.description}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

### 5.6 渲染效果

#### 流式中 — 单个 SubAgent

```
┌──────────────────────────────────────────────────┐
│ 🤖  researcher  搜索2024年大语言模型最新进展  ···  │  ← 脉冲动画
└──────────────────────────────────────────────────┘
```

#### 流式中 — 多个并行 SubAgent

```
┌──────────────────────────────────────────────────┐
│ 🤖  researcher  搜索2024年大语言模型最新进展  ···  │  ← 脉冲动画
├──────────────────────────────────────────────────┤
│ 🤖  writer     撰写论文综述初稿            ···  │  ← 脉冲动画
└──────────────────────────────────────────────────┘
```

#### 历史消息 — 折叠状态（默认）

```
┌──────────────────────────────────────────────────┐
│ 🤖 researcher — 搜索2024年大语言模型最新进展  4.5s ▸│
└──────────────────────────────────────────────────┘
```

#### 历史消息 — 展开状态

```
┌──────────────────────────────────────────────────┐
│ 🤖 researcher — 搜索2024年大语言模型最新进展  4.5s ▾│
│ ────────────────────────────────────────────────  │
│ 找到以下3篇关键论文:                                │
│ 1. GPT-5 Technical Report - OpenAI (2024.03)     │
│ 2. Claude 3.5 Opus - Anthropic (2024.06)         │
│ 3. Gemini 2.0 - Google DeepMind (2024.09)        │
│                                                   │
│ 主要进展包括...                                     │
└──────────────────────────────────────────────────┘
```

## 6. 数据流完整路径

### 写入路径（用户发消息 → 存储）

```
1. 用户发送: "帮我调研最新的 AI 论文"
2. 主 Agent 决定委派 → 调用 task(description="搜索...", subagent_type="researcher")
3. deepagents 发出: on_tool_start(name="task", input={...})
4. deep_agent_service 识别: name=="task" → yield subagent_start
5. agent_chat SSE 转发: event: subagent_start, data: {name, description}
6. 前端: setActiveSubagent({name, description}) → 显示脉冲指示
7. deepagents SubAgent.invoke() 执行中...
8. deepagents 发出: on_tool_end(name="task", output=ToolMessage)
9. deep_agent_service 识别: → yield subagent_end
10. agent_chat:
    - StreamingCollector.add_subagent_end(result)
    - SSE 转发: event: subagent_end, data: {result}
11. 前端: setActiveSubagent(null) → 移除指示
12. 主 Agent 继续处理，输出最终文本...
13. 流结束: collector.to_parts_data() → 保存 MessageParts:
    [thinking?, subagent_call, text, ...]
```

### 读取路径（加载历史消息 → 渲染）

```
1. 前端加载 Topic 消息列表
2. API 返回 Message + MessageParts
3. AIMessageList.organizedParts 遍历 Parts:
   - type=="subagent_call" → parse JSON → push {type: 'subagent_call', data}
4. 渲染: <SubAgentCallPart data={...} /> → 折叠卡片
```

## 7. 明确不做的事项

| 不做 | 原因 |
|------|------|
| 为 SubAgent 创建独立 Session/Topic | SubAgent 是无状态工具调用，不是独立会话 |
| 在 Message 表加 agent_id 字段 | 信息已通过 `subagent_call` Part 表达，无需冗余 |
| 修改 deepagents 库 | 在应用层解决，保持升级兼容性 |
| 流式传输 SubAgent 内部过程 | 需改 `.invoke()` 为 `.astream_events()`，侵入性大 |
| 新建数据库表或迁移 | 复用 `MessagePart`，只加常量 |
| 将 SubAgent 对话历史独立存储 | 违反"SubAgent 无状态"原则 |
