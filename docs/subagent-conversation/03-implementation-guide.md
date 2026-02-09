# SubAgent 对话可见性 — 实施指南

## 实施顺序

按依赖关系分为 3 个阶段，每阶段可独立验证。

```
Phase 1 (后端基础)   →   Phase 2 (前端渲染)   →   Phase 3 (流式指示)
  P0: 必须                 P1: 重要                P2: 体验优化
  ~70 行改动                ~80 行改动               ~35 行改动
```

---

## Phase 1 — 后端基础（P0）

### Step 1.1: 新增 MessagePartType 常量

**文件**: `app/constants/message.py`

```diff
 class MessagePartType:
     TEXT = "text"
     IMAGE = "image"
     TOOL_CALL = "tool_call"
     TOOL_RESULT = "tool_result"
     THINKING = "thinking"
     ERROR = "error"
+    SUBAGENT_CALL = "subagent_call"
```

### Step 1.2: 事件识别 — deep_agent_service.py

**文件**: `app/agent/deep_agent_service.py`

**改动 1**: 抽取 `_safe_serialize()` 工具函数（减少重复）

在 `DeepAgentService` 类外部或作为静态方法添加：

```python
def _safe_serialize(value) -> str:
    """安全序列化工具输出为字符串"""
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, (dict, list)):
        try:
            import json
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(value)
    try:
        return str(value)
    except Exception:
        return f"<{type(value).__name__}>"
```

**改动 2**: `chat_stream()` 事件处理

在 `on_tool_start` 和 `on_tool_end` 分支中加入 `task` 工具识别：

```python
elif event_type == "on_tool_start":
    tool_name = event.get("name", "unknown")
    tool_input = event_data.get("input", {})

    if tool_name == "task":
        # SubAgent 委派 — 透传 run_id 支持并行
        run_id = event.get("run_id")
        subagent_name = tool_input.get("subagent_type", "unknown")
        description = tool_input.get("description", "")
        logger.info(f"SubAgent delegation: {subagent_name} (run_id={run_id})")
        yield {
            "event": "subagent_start",
            "data": {
                "run_id": run_id,
                "name": subagent_name,
                "description": description,
            },
        }
    else:
        # 普通工具调用（保持现有的序列化逻辑）
        safe_input = _safe_serialize_dict(tool_input)
        yield {
            "event": "tool_call",
            "data": {"name": tool_name, "args": safe_input},
        }

elif event_type == "on_tool_end":
    tool_name = event.get("name", "unknown")
    tool_output = event_data.get("output", "")

    if tool_name == "task":
        # SubAgent 完成 — 透传 run_id 匹配对应的 start
        run_id = event.get("run_id")
        result_str = _safe_serialize(tool_output)
        logger.info(f"SubAgent completed (run_id={run_id})")
        yield {
            "event": "subagent_end",
            "data": {"run_id": run_id, "result": result_str},
        }
    else:
        # 普通工具结果（保持现有的序列化逻辑）
        result_str = _safe_serialize(tool_output)
        yield {
            "event": "tool_result",
            "data": {"name": tool_name, "result": result_str},
        }
```

### Step 1.3: StreamingCollector 扩展 — agent_chat.py

**文件**: `app/router/v1/agent_chat.py`

**改动 1**: 在 `StreamingCollector` dataclass 中新增字段和方法

```python
@dataclass
class StreamingCollector:
    # ... 现有字段 ...
    subagent_calls: List[StreamingPart] = field(default_factory=list)
    _active_subagents: dict = field(default_factory=dict)  # ★ run_id → info（支持并行）

    def add_subagent_start(self, run_id: str, name: str, description: str) -> str:
        """用 run_id 追踪，支持多个 SubAgent 并行执行"""
        call_id = self.generate_call_id()
        self._active_subagents[run_id] = {
            "call_id": call_id,
            "name": name,
            "description": description,
            "start_time": datetime.utcnow(),
        }
        return call_id

    def add_subagent_end(self, run_id: str, result: str):
        """用 run_id 匹配对应的 start，即使乱序也能正确关联"""
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
        """流中断时，将所有未完成的并行 SubAgent 调用补充关闭"""
        for run_id in list(self._active_subagents.keys()):
            self.add_subagent_end(run_id, cancel_result)
```

**改动 2**: 更新 `has_content()` 和 `to_parts_data()`

- `has_content()`: 加入 `self.subagent_calls` 判断
- `to_parts_data()`: 在 timed_parts 合并中加入 subagent_calls

**改动 3**: `generate_events()` 中处理新事件类型

```python
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
```

**改动 4**: `CancelledError` 处理中补充关闭

```python
except asyncio.CancelledError:
    collector.flush_active_subagents("[已取消]")  # ★ 关闭所有未完成的并行调用
    # ... 现有取消处理逻辑 ...
```

### Phase 1 验证

```bash
# 1. 确保项目可启动
python -m pytest tests/ -x

# 2. 使用有 SubAgent 的 Agent 发送消息
# 3. 检查服务端日志：
#    - 应看到 "SubAgent delegation: {name}"
#    - 应看到 "SubAgent completed: task"

# 4. 检查 SSE 事件流（浏览器 Network → EventStream）：
#    - 应看到 event: subagent_start
#    - 应看到 event: subagent_end

# 5. 检查数据库 message_part 表：
#    - 应看到 type="subagent_call" 的记录
#    - content 应为 JSON，包含 name/description/result/duration_ms
```

---

## Phase 2 — 前端历史渲染（P1）

### Step 2.1: 类型定义

**文件**: `frontend/src/lib/api.ts`（或类型定义所在文件）

```typescript
// 在 MessagePart 相关类型附近添加
export interface SubAgentCallData {
  call_id: string;
  name: string;
  description: string;
  result: string;
  duration_ms: number;
}

export function parseSubAgentCallContent(part: MessagePart): SubAgentCallData | null {
  try {
    return JSON.parse(part.content) as SubAgentCallData;
  } catch {
    return null;
  }
}
```

### Step 2.2: SubAgentCallPart 组件

**文件**: `frontend/src/components/chat/SubAgentCallPart.tsx`（新建）

完整组件代码见 `02-design.md` 第 5.4 节。

关键点：
- 默认折叠，点击展开
- 显示 SubAgent 名称、任务描述、执行耗时
- 展开后用 StreamingMessage 渲染结果（支持 Markdown）

### Step 2.3: AIMessageList 集成

**文件**: `frontend/src/components/chat/AIMessageList.tsx`

在 `organizedParts` 的 switch 中添加 `'subagent_call'` case。
在渲染 map 中添加 `<SubAgentCallPart>` 分支。

### Phase 2 验证

```
1. 有 SubAgent 调用历史的 Topic → 加载消息
2. 应看到折叠的 SubAgent 卡片（不是普通工具调用卡片）
3. 点击卡片 → 展开显示 SubAgent 返回的完整结果
4. 耗时显示正确（ms 或 s 自动切换）
```

---

## Phase 3 — 流式状态指示（P2）

### Step 3.1: 状态管理

**文件**: `frontend/src/store/chat.ts` 或 `frontend/src/hooks/useAIChat.ts`

新增 `activeSubagents` Map 状态（支持并行），在 SSE 事件处理中按 `call_id` 添加/移除。

### Step 3.2: 指示器渲染

**文件**: `frontend/src/components/chat/AIMessageList.tsx`

遍历 `activeSubagents` Map，为每个活跃的 SubAgent 渲染一个脉冲指示器。
详见 `02-design.md` 第 5.5 节。

### Phase 3 验证

```
1. 发送需要 SubAgent 处理的消息
2. 应看到脉冲动画指示: "🤖 researcher 正在处理: ..."
3. SubAgent 完成后对应指示器消失
4. 最终消息中包含折叠的 SubAgent 卡片
5. （如可触发并行）应同时看到多个脉冲指示器
```

---

## 边界情况处理

### 多个 SubAgent 并行调用

LLM 可在一次回复中发出多个 `task` tool_call，LangGraph 并发执行。
事件流交错出现，用 `run_id` 正确匹配 start/end：

```
on_tool_start("task", run_id=A, {subagent_type="researcher"})
on_tool_start("task", run_id=B, {subagent_type="writer"})
on_tool_end("task", run_id=A, output=...)   ← A 先完成
on_tool_end("task", run_id=B, output=...)   ← B 后完成
```

`_active_subagents` 字典同时追踪 A 和 B，`pop(run_id)` 按 ID 精确匹配。
前端 `activeSubagents` Map 同时显示两个脉冲指示器。
存储为两个独立的 `subagent_call` Parts，按完成时间排序。

### 多个 SubAgent 串行调用

主 Agent 可能分多步连续委派。每次 start/end 成对，生成独立的 Part。
与并行场景共用同一套 run_id 机制，无需特殊处理。

### SubAgent 调用失败

如果 SubAgent 执行出错，deepagents 会返回错误信息作为 ToolMessage。这个错误会被 `on_tool_end` 捕获，存入 `subagent_call.result` 字段。前端卡片展开后可看到错误信息。

### 流中断（用户取消）

如果在 SubAgent 执行期间用户取消，可能有多个活跃的并行 SubAgent：

```python
except asyncio.CancelledError:
    # ★ 关闭所有未完成的并行 SubAgent 调用
    collector.flush_active_subagents("[已取消]")
    # ... 现有取消处理逻辑 ...
```

`flush_active_subagents()` 遍历 `_active_subagents` 字典，为每个生成一个带 "[已取消]" 的 Part。

### WebSocket 路径

`chat_websocket` 端点需要同样的事件处理逻辑。改动与 SSE 路径对称：
- `stream_to_ws()` 中处理 `subagent_start` / `subagent_end`（携带 `run_id`）
- 转发为 WebSocket 消息: `{"type": "subagent_start", ...}` / `{"type": "subagent_end", ...}`
- `CancelledError` 中调用 `collector.flush_active_subagents()`
