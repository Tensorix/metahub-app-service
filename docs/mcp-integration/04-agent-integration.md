# Step 4: 与 DeepAgentService 集成

## 4.1 集成点分析

当前 `DeepAgentService` 的工具获取流程:

```python
# 现在 (deep_agent_service.py)
def _get_tools(self) -> list:
    from app.agent.tools import ToolRegistry
    tool_names = self.config.get("tools") or []
    return ToolRegistry.get_tools(tool_names)  # 仅内置工具
```

集成后的流程:

```python
# 集成后
async def _get_all_tools(self) -> list:
    # 1. 内置工具 (同步)
    builtin_tools = self._get_tools()

    # 2. MCP 工具 (异步)
    mcp_tools = await self._get_mcp_tools()

    # 3. 合并，内置工具优先
    return self._merge_tools(builtin_tools, mcp_tools)
```

## 4.2 AgentFactory.build_agent_config 变更

需要在构建 Agent 配置时包含 MCP Server 配置:

```python
# app/agent/factory.py - build_agent_config 方法新增部分

@classmethod
def build_agent_config(cls, agent: "Agent") -> dict[str, Any]:
    agent_config = {
        # ... 现有配置 ...
    }

    # 新增: MCP Servers 配置
    if agent.mcp_servers:
        agent_config["mcp_servers"] = [
            {
                "name": ms.name,
                "url": ms.url,
                "headers": ms.headers,
                "is_enabled": ms.is_enabled,
            }
            for ms in agent.mcp_servers
            if not ms.is_deleted
        ]

    return agent_config
```

## 4.3 DeepAgentService 变更

### 修改 __init__

```python
class DeepAgentService:
    def __init__(
        self,
        agent_config: dict[str, Any],
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[AsyncPostgresStore] = None,
    ):
        self.config = agent_config
        self.checkpointer = checkpointer
        self.store = store
        self._agent = None
        self._mcp_tools_loaded = False  # 新增: MCP 工具是否已加载
```

### 新增 _get_mcp_tools 方法

```python
async def _get_mcp_tools(self) -> list:
    """
    从配置的 MCP Server 获取工具列表.

    Returns:
        LangChain BaseTool 列表，获取失败返回空列表
    """
    mcp_servers = self.config.get("mcp_servers") or []
    if not mcp_servers:
        return []

    from app.agent.mcp import get_mcp_client_manager

    manager = get_mcp_client_manager()

    # 使用 agent name 作为缓存 key（因为此处无 agent_id）
    # 实际使用时由 factory 传入 agent_id
    agent_id = self.config.get("_agent_id")
    if not agent_id:
        logger.warning("No agent_id in config, MCP tool cache disabled")
        # 直接获取不缓存
        from uuid import uuid4
        agent_id = uuid4()

    try:
        tools = await manager.get_tools(agent_id, mcp_servers)
        logger.info(f"Loaded {len(tools)} MCP tools")
        return tools
    except Exception as e:
        logger.error(f"Failed to load MCP tools: {e}")
        return []
```

### 新增 _merge_tools 方法

```python
def _merge_tools(
    self,
    builtin_tools: list,
    mcp_tools: list,
) -> list:
    """
    合并内置工具和 MCP 工具.

    内置工具优先：如果 MCP 工具与内置工具同名，跳过 MCP 工具。

    Args:
        builtin_tools: ToolRegistry 提供的内置工具
        mcp_tools: MCPClientManager 提供的 MCP 工具

    Returns:
        合并后的工具列表
    """
    builtin_names = {t.name for t in builtin_tools}
    merged = list(builtin_tools)

    for tool in mcp_tools:
        if tool.name in builtin_names:
            logger.warning(
                f"MCP tool '{tool.name}' conflicts with built-in tool, skipped"
            )
            continue
        merged.append(tool)
        builtin_names.add(tool.name)  # 防止 MCP 工具间重复

    return merged
```

### 修改 _get_agent 方法

这是最关键的变更。由于 `_get_mcp_tools` 是异步方法，而 `_get_agent` 当前是同步的，
需要将 `_get_agent` 改为异步方法:

```python
async def _get_agent(self):
    """
    Create deep agent with all features enabled.

    Built-in tools (auto-enabled):
    - Planning: write_todos, read_todos
    - Filesystem: ls, read_file, write_file, edit_file, glob, grep
    - SubAgent: task (if subagents configured)
    - MCP tools: dynamically loaded from configured MCP Servers  ← 新增
    """
    if self._agent is None:
        # Build middleware list
        middleware = []

        # SubAgent middleware
        subagent_mw = self._build_subagent_middleware()
        if subagent_mw:
            middleware.append(subagent_mw)

        # Summarization middleware
        summarization_mw = self._build_summarization_middleware()
        if summarization_mw:
            middleware.append(summarization_mw)

        # Build model
        from langchain.chat_models import init_chat_model
        model_string = self._get_model_string()
        model_kwargs = self._get_model_kwargs()
        model = init_chat_model(model_string, **model_kwargs)

        # 获取工具 (内置 + MCP)  ← 变更点
        builtin_tools = self._get_tools()
        mcp_tools = await self._get_mcp_tools()
        all_tools = self._merge_tools(builtin_tools, mcp_tools)

        # Agent kwargs
        agent_kwargs = {
            "model": model,
            "tools": all_tools,  # ← 使用合并后的工具列表
            "system_prompt": self.config.get("system_prompt") or (
                "You are a helpful AI assistant."
            ),
            "middleware": middleware,
            "checkpointer": self.checkpointer,
            "store": self.store,
            "backend": self._build_backend(),
            "name": self.config.get("name"),
        }

        logger.info(
            f"Creating deep agent: model={model_string}, "
            f"tools={len(builtin_tools)} builtin + {len(mcp_tools)} mcp, "
            f"middleware={len(middleware)}, "
            f"subagents={len(subagent_mw.subagents) if subagent_mw else 0}"
        )

        self._agent = create_deep_agent(**agent_kwargs)

    return self._agent
```

### 更新调用方 (chat 和 chat_stream)

由于 `_get_agent()` 变为异步方法，需要更新调用方:

```python
async def chat(self, message, thread_id, user_id=None, session_id=None):
    agent = await self._get_agent()  # 添加 await
    # ... 其余不变

async def chat_stream(self, message, thread_id, user_id=None, session_id=None):
    agent = await self._get_agent()  # 添加 await
    # ... 其余不变

async def get_history(self, thread_id, limit=50):
    # ... _get_agent() 调用也需要 await
    state = await (await self._get_agent()).aget_state(config_dict)
```

## 4.4 AgentFactory 变更

在 `build_agent_config` 中传递 `_agent_id`:

```python
@classmethod
def build_agent_config(cls, agent: "Agent") -> dict[str, Any]:
    agent_config = {
        "_agent_id": agent.id,  # 新增: 用于 MCP 缓存 key
        "name": agent.name,
        # ... 其他现有字段 ...
    }

    # 新增: MCP Servers 配置
    if agent.mcp_servers:
        agent_config["mcp_servers"] = [
            {
                "name": ms.name,
                "url": ms.url,
                "headers": ms.headers,
                "is_enabled": ms.is_enabled,
            }
            for ms in agent.mcp_servers
            if not ms.is_deleted
        ]

    return agent_config
```

在 `clear_cache` 中同时清除 MCP 工具缓存:

```python
@classmethod
def clear_cache(cls, agent_id: Optional[UUID] = None):
    if agent_id:
        cache_key = str(agent_id)
        if cache_key in cls._agents:
            del cls._agents[cache_key]
        # 新增: 清除 MCP 工具缓存
        from app.agent.mcp import get_mcp_client_manager
        get_mcp_client_manager().invalidate_cache(agent_id)
    else:
        cls._agents.clear()
        from app.agent.mcp import get_mcp_client_manager
        get_mcp_client_manager().clear_cache()
```

## 4.5 向后兼容性

- 没有配置 MCP Server 的 Agent 行为完全不变（`mcp_servers` 为空列表）
- `_get_agent()` 从同步变为异步，但所有调用方（`chat`, `chat_stream`, `get_history`）本身已经是异步方法，变更影响最小
- Agent 缓存机制不变，MCP Server 配置变更时会通过 `clear_cache` 使缓存失效

## 4.6 系统提示词增强

当 Agent 配置了 MCP Server 时，可以自动增强系统提示词，让 LLM 知道有额外的外部工具可用:

```python
def _build_system_prompt(self) -> str:
    """构建系统提示词，包含 MCP 工具信息."""
    base_prompt = self.config.get("system_prompt") or (
        "You are a helpful AI assistant."
    )

    mcp_servers = self.config.get("mcp_servers") or []
    enabled = [s for s in mcp_servers if s.get("is_enabled", True)]

    if enabled:
        server_info = ", ".join(s["name"] for s in enabled)
        base_prompt += (
            f"\n\nYou also have access to external tools from "
            f"the following MCP servers: {server_info}. "
            f"Use them when they can help accomplish the user's task."
        )

    return base_prompt
```

> **注意**: 这个系统提示词增强是可选的。LLM 可以从工具的 name 和 description 自行判断何时使用 MCP 工具。但显式提示可以提高工具使用率。
