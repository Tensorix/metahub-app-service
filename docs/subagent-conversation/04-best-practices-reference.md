# SubAgent 对话可见性 — LangChain 最佳实践参考

本文档记录 LangChain/LangGraph/DeepAgents 的 SubAgent 最佳实践，作为设计决策的依据。

## 1. 三种主流 SubAgent 架构模式

### 模式 A: SubAgent 即工具（本项目采用）

SubAgent 被包装为父 Agent 可调用的工具。父 Agent 决定何时委派、传什么参数、如何整合结果。

```python
# LangChain 标准模式
@tool
def schedule_event(request: str) -> str:
    result = calendar_agent.invoke({
        "messages": [{"role": "user", "content": request}]  # 干净上下文
    })
    return result["messages"][-1].content  # 只返回最终结果
```

deepagents 库的 `task` 工具就是这个模式的实现。

**优点**: 简单、隔离性好、可组合
**缺点**: SubAgent 执行是同步黑盒，无中间状态

### 模式 B: Handoff 模式

使用 `langgraph-supervisor` 的 `create_handoff_tool`，控制权完全转交给目标 Agent。默认传递完整消息历史。

**适用场景**: 完全不同领域的 Agent 协作（如客服转人工）
**不适用本项目**: SubAgent 是任务委派，不是控制权转移

### 模式 C: 子图模式

LangGraph 允许将 SubAgent 编译为子图（subgraph），有独立状态空间和可选的独立 checkpointer。

```python
# 独立记忆的子图
subgraph = subgraph_builder.compile(checkpointer=True)
```

**适用场景**: SubAgent 需要跨调用保持记忆
**不适用本项目**: SubAgent 设计为无状态

## 2. 上下文隔离原则

> "Subagents are stateless -- they don't remember past interactions, with all conversation memory maintained by the main agent."
> — LangChain 官方文档

### deepagents 的隔离实现

```python
# deepagents/subagents.py 关键代码
_EXCLUDED_STATE_KEYS = {"messages", "todos", "structured_response"}

subagent_state = {
    k: v for k, v in runtime.state.items()
    if k not in _EXCLUDED_STATE_KEYS
}
subagent_state["messages"] = [HumanMessage(content=description)]
```

SubAgent 接收的是：
- ✅ 任务描述（作为全新的 HumanMessage）
- ✅ 共享的 backend/filesystem 状态（去除 messages、todos、structured_response）
- ❌ 不包含父 Agent 的对话历史
- ❌ 不包含父 Agent 的 todo 列表
- ❌ 不包含结构化响应状态

这完全符合 LangChain 推荐的隔离模式。

### 可选的上下文共享

LangChain 提供 `ToolRuntime` 机制，允许 SubAgent 在需要时访问父 Agent 的状态：

```python
@tool
def schedule_event(request: str, runtime: ToolRuntime) -> str:
    original_msg = next(
        m for m in runtime.state["messages"] if m.type == "human"
    )
```

deepagents 的 `task` 工具已通过 `runtime` 参数支持此机制，但默认不传递 messages。

## 3. 结果返回原则

> "We return only the sub-agent's final response, as the supervisor doesn't need to see intermediate reasoning or tool calls."
> — LangChain 官方文档

### 关键失败模式

SubAgent 执行了工具调用但在最终回复中不包含结果。由于父 Agent 只看到最终消息，这等于信息丢失。

**缓解方式**: SubAgent 的 system_prompt 应明确要求在最终回复中包含所有关键信息：

```
"你的最终回复必须包含所有关键发现和结果。不要假设调用者能看到你的中间步骤。"
```

### deepagents 的结果传递

```python
# deepagents/subagents.py
result = subagent.invoke(subagent_state)

# 提取最后一条 AI 消息
messages = result.get("messages", [])
last_message = messages[-1] if messages else AIMessage(content="No response")

# 包装为 ToolMessage 返回给父 Agent
return Command(update={
    "messages": [ToolMessage(last_message.content, tool_call_id=tool_call_id)]
})
```

## 4. UI 可见性最佳实践

### LangChain 推荐的 UI 模式

| 层级 | 可见性 | 说明 |
|------|--------|------|
| Supervisor 决策 | ✅ 始终可见 | 用户看到 "正在委派给 researcher..." |
| SubAgent 最终结果 | ✅ 可展开查看 | 折叠显示摘要，展开看详情 |
| SubAgent 中间推理 | ❌ 默认隐藏 | 除非用户主动请求 |
| SubAgent 工具调用 | ❌ 默认隐藏 | 内部实现细节 |

### 流式控制

LangChain 使用 tag 控制流式可见性：

```python
# 阻止 SubAgent 的 LLM 调用流式输出到 UI
model = ChatAnthropic(...).with_config(tags=["langsmith:nostream"])
```

deepagents 库不支持此 tag 机制，但由于 SubAgent 使用 `.invoke()` 而非 `.astream_events()`，**天然不会流式输出**。

### Human-in-the-Loop

LangChain 建议 checkpoint 只加在顶层 Agent：

```python
# 只在顶层 Agent 添加 checkpointer
graph = builder.compile(checkpointer=checkpointer)
```

本项目已遵循此模式 — checkpointer 在 `AgentFactory.create_agent()` 中配置给主 Agent。

## 5. 架构选择对照表

| 决策点 | LangChain 推荐 | 本项目选择 | 一致性 |
|--------|---------------|-----------|--------|
| SubAgent 模式 | SubAgent 即工具 | deepagents task 工具 | ✅ |
| 上下文传递 | 只传任务描述 | 排除 messages/todos | ✅ |
| 结果返回 | 只返回最终消息 | ToolMessage 包装 | ✅ |
| 状态管理 | Supervisor 持有 | 主 Agent + checkpointer | ✅ |
| UI 可见性 | 显示决策+结果，隐藏内部 | 需实现（本次改进） | 🔧 |
| 会话隔离 | 不创建独立会话 | 不创建（Part 语义） | ✅ |
| 中间流式 | 可选（tag 控制） | 不流式（invoke 机制） | ✅ |

## 6. 参考资料

- [LangChain Subagents 文档](https://docs.langchain.com/oss/python/langchain/multi-agent/subagents)
- [LangChain Handoffs 文档](https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs)
- [LangGraph Hierarchical Agent Teams](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/hierarchical_agent_teams/)
- [LangGraph Supervisor Library](https://github.com/langchain-ai/langgraph-supervisor-py)
- [Deep Agents 概览](https://docs.langchain.com/oss/python/deepagents/overview)
- [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui)
- [Multi-Agent Workflows Blog](https://blog.langchain.com/langgraph-multi-agent-workflows/)
