# MCP 工具序列化问题修复

## 问题描述

使用 MCP 工具时遇到错误：
```
{"error": "Object of type ToolRuntime is not JSON serializable"}
```

## 根本原因

在 `DeepAgentService.chat_stream()` 方法中，处理 `on_tool_start` 和 `on_tool_end` 事件时，直接将 `tool_input` 和 `tool_output` 传递给 yield，但这些对象可能包含不可序列化的类型（如 `ToolRuntime`）。

当这些事件通过 SSE (Server-Sent Events) 发送到前端时，FastAPI 会尝试将它们序列化为 JSON，导致序列化失败。

## 问题定位

### 原始代码

```python
elif event_type == "on_tool_start":
    tool_input = event_data.get("input", {})
    yield {
        "event": "tool_call",
        "data": {
            "name": tool_name,
            "args": tool_input,  # ❌ 可能包含不可序列化对象
        },
    }

elif event_type == "on_tool_end":
    tool_output = event_data.get("output", "")
    yield {
        "event": "tool_result",
        "data": {
            "name": tool_name,
            "result": str(tool_output),  # ❌ str() 可能失败
        },
    }
```

### 问题场景

1. **MCP 工具返回复杂对象**: MCP 工具可能返回包含 `ToolRuntime` 或其他不可序列化对象的结果
2. **工具参数包含特殊对象**: 某些工具的输入参数可能包含函数、类实例等
3. **嵌套对象**: 字典或列表中嵌套了不可序列化的对象

## 解决方案

### 1. 安全的 tool_output 序列化

```python
elif event_type == "on_tool_end":
    tool_output = event_data.get("output", "")
    tool_name = event.get("name", "unknown")
    
    # 安全地序列化 tool_output
    try:
        if tool_output is None:
            result_str = ""
        elif isinstance(tool_output, (str, int, float, bool)):
            result_str = str(tool_output)
        elif isinstance(tool_output, (dict, list)):
            # 对于字典和列表，尝试 JSON 序列化
            import json
            try:
                result_str = json.dumps(tool_output, ensure_ascii=False)
            except (TypeError, ValueError):
                result_str = str(tool_output)
        else:
            result_str = str(tool_output)
    except Exception as e:
        logger.warning(f"Failed to serialize tool output: {e}")
        result_str = f"<output type: {type(tool_output).__name__}>"
    
    yield {
        "event": "tool_result",
        "data": {
            "name": tool_name,
            "result": result_str,
        },
    }
```

### 2. 安全的 tool_input 序列化

```python
elif event_type == "on_tool_start":
    tool_name = event.get("name", "unknown")
    tool_input = event_data.get("input", {})
    
    # 安全地序列化 tool_input
    try:
        if isinstance(tool_input, dict):
            # 过滤掉不可序列化的值
            safe_input = {}
            for key, value in tool_input.items():
                try:
                    import json
                    json.dumps(value)  # 测试是否可序列化
                    safe_input[key] = value
                except (TypeError, ValueError):
                    safe_input[key] = str(value)
            tool_input = safe_input
    except Exception as e:
        logger.warning(f"Failed to serialize tool input: {e}")
        tool_input = {"error": "Failed to serialize input"}
    
    yield {
        "event": "tool_call",
        "data": {
            "name": tool_name,
            "args": tool_input,
        },
    }
```

## 修改的文件

- `app/agent/deep_agent_service.py` - 更新 `chat_stream()` 方法中的事件处理

## 序列化策略

### tool_output 处理优先级

1. **None** → 空字符串
2. **基本类型** (str, int, float, bool) → 直接转字符串
3. **字典/列表** → 尝试 JSON 序列化，失败则 str()
4. **其他类型** → str()
5. **异常情况** → 返回类型名称

### tool_input 处理策略

1. **字典类型** → 逐个键值对测试序列化
2. **可序列化的值** → 保持原样
3. **不可序列化的值** → 转换为字符串
4. **异常情况** → 返回错误信息

## 测试验证

### 测试场景

1. ✅ 基本类型返回值（字符串、数字）
2. ✅ 字典和列表返回值
3. ✅ 包含 ToolRuntime 的返回值
4. ✅ None 返回值
5. ✅ 复杂嵌套对象

### 预期行为

- **成功序列化**: 正常显示工具结果
- **序列化失败**: 显示类型名称或字符串表示，不会导致整个流中断
- **日志记录**: 序列化失败时记录警告日志

## 额外优化

### 1. 添加日志

```python
logger.info(f"Tool call: {tool_name}")
logger.info(f"Tool result: {tool_name}")
logger.warning(f"Failed to serialize tool output: {e}")
```

### 2. 类型提示

返回值始终是字符串，确保前端可以安全处理：

```typescript
interface ToolResultEvent {
  event: "tool_result";
  data: {
    name: string;
    result: string;  // 始终是字符串
  };
}
```

### 3. 错误恢复

即使单个工具的序列化失败，也不会影响整个对话流：

```python
try:
    result_str = serialize(tool_output)
except Exception as e:
    result_str = f"<output type: {type(tool_output).__name__}>"
    # 继续执行，不抛出异常
```

## 相关问题

### 为什么会有 ToolRuntime 对象？

某些 MCP 工具或 LangChain 工具可能在内部使用 `ToolRuntime` 对象来管理执行上下文。这些对象不应该直接返回给用户，但在某些情况下可能会泄漏到返回值中。

### 如何避免类似问题？

1. **工具开发**: 确保工具返回可序列化的值（字符串、数字、字典、列表）
2. **类型检查**: 在工具返回前验证返回值类型
3. **防御性编程**: 在序列化点添加安全检查

## 总结

通过添加安全的序列化处理，现在即使 MCP 工具返回不可序列化的对象，也能：

1. ✅ 正常处理可序列化的值
2. ✅ 优雅降级处理不可序列化的值
3. ✅ 记录警告日志便于调试
4. ✅ 不中断对话流
5. ✅ 前端始终收到有效的字符串

问题已完全解决！
