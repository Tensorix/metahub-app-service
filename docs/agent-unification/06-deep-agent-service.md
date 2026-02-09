# Step 6: DeepAgentService 运行时改造

## 概述

改造 `DeepAgentService`，使 SubAgent 在运行时获得完整的 Agent 能力：
1. SubAgent 支持加载自己的 MCP 工具
2. SubAgent 支持独立的 `model_provider`（不同的 LLM 提供商）
3. SubAgent 支持 `temperature` / `max_tokens` 微调
4. 整体改动很小，因为当前的抽象已经做得很好

## 6.1 `_build_subagent_middleware()` 改造

### 当前实现

```python
def _build_subagent_middleware(self) -> Optional[SubAgentMiddleware]:
    subagent_records = self.config.get("subagents") or []
    if not subagent_records:
        return None

    from app.agent.tools import ToolRegistry

    subagents = []
    for sa in subagent_records:
        subagent = SubAgent(
            name=sa["name"],
            description=sa["description"],
            system_prompt=sa.get("system_prompt", ""),
            tools=ToolRegistry.get_tools(sa.get("tools") or []),
            model=sa.get("model"),  # ← 仅传 model name，无法指定 provider
        )
        subagents.append(subagent)

    return SubAgentMiddleware(
        subagents=subagents,
        default_model=self._get_model_string()
    )
```

### 新实现

```python
async def _build_subagent_middleware(self) -> Optional[SubAgentMiddleware]:
    """Build SubAgentMiddleware with full agent capabilities.

    改进：
    1. SubAgent 支持独立的 model_provider → 完整的 provider:model 格式
    2. SubAgent 支持加载自己的 MCP 工具
    3. SubAgent 支持 model_kwargs (API key, base_url 等)
    """
    subagent_records = self.config.get("subagents") or []
    if not subagent_records:
        return None

    from app.agent.tools import ToolRegistry

    subagents = []
    for sa in subagent_records:
        # 1. 构建工具列表 (内置 + MCP)
        builtin_tools = ToolRegistry.get_tools(sa.get("tools") or [])
        mcp_tools = await self._get_subagent_mcp_tools(sa)
        all_tools = self._merge_tools(builtin_tools, mcp_tools)

        # 2. 构建完整的 model 标识
        model = self._build_subagent_model(sa)

        subagent = SubAgent(
            name=sa["name"],
            description=sa["description"],
            system_prompt=sa.get("system_prompt", ""),
            tools=all_tools,
            model=model,  # ← 现在是完整的 Model 实例或 provider:name 字符串
        )
        subagents.append(subagent)

    return SubAgentMiddleware(
        subagents=subagents,
        default_model=self._get_model_string()
    )
```

## 6.2 新增辅助方法

### SubAgent MCP 工具加载

```python
async def _get_subagent_mcp_tools(self, sa_config: dict) -> list:
    """加载 SubAgent 配置的 MCP 工具。

    复用现有的 MCPClientManager，使用子 Agent 的 _agent_id 作为缓存 key。
    """
    mcp_servers = sa_config.get("mcp_servers") or []
    if not mcp_servers:
        return []

    from app.agent.mcp import get_mcp_client_manager

    manager = get_mcp_client_manager()
    agent_id = sa_config.get("_agent_id")

    if not agent_id:
        logger.warning(f"SubAgent '{sa_config.get('name')}' has no _agent_id, "
                       f"MCP tool cache disabled")
        from uuid import uuid4
        agent_id = uuid4()

    try:
        tools = await manager.get_tools(agent_id, mcp_servers)
        logger.info(f"SubAgent '{sa_config.get('name')}': loaded {len(tools)} MCP tools")
        return tools
    except Exception as e:
        logger.error(f"SubAgent '{sa_config.get('name')}': failed to load MCP tools: {e}")
        return []
```

### SubAgent Model 构建

```python
def _build_subagent_model(self, sa_config: dict):
    """为 SubAgent 构建 model 实例或标识。

    如果 SubAgent 指定了 model_provider，构建完整的 model 实例
    （因为可能需要不同 provider 的 API key）。
    如果未指定，返回 model name 字符串（继承父 Agent 的 provider）。
    """
    model_name = sa_config.get("model")
    model_provider = sa_config.get("model_provider")

    if not model_name:
        return None  # 继承父 Agent 的 model

    if model_provider:
        # SubAgent 有独立的 provider — 需要构建完整的 model 实例
        from langchain.chat_models import init_chat_model

        model_string = (
            model_name if ":" in model_name
            else f"{model_provider}:{model_name}"
        )

        # 获取 provider 对应的 API key
        kwargs = self._get_model_kwargs_for_provider(model_provider)

        return init_chat_model(model_string, **kwargs)
    else:
        # 没有独立 provider — 使用父 Agent 的 provider
        # 返回 model name，由 SubAgentMiddleware 的 default_model 提供 provider
        return model_name


def _get_model_kwargs_for_provider(self, provider: str) -> dict:
    """获取指定 provider 的 model kwargs。

    扩展 _get_model_kwargs() 以支持多 provider。
    """
    kwargs = {}

    if provider == "openai":
        if config.OPENAI_API_KEY:
            kwargs["api_key"] = config.OPENAI_API_KEY
        if config.OPENAI_BASE_URL:
            kwargs["base_url"] = config.OPENAI_BASE_URL
    elif provider == "anthropic":
        if hasattr(config, 'ANTHROPIC_API_KEY') and config.ANTHROPIC_API_KEY:
            kwargs["api_key"] = config.ANTHROPIC_API_KEY
    elif provider == "google":
        if hasattr(config, 'GOOGLE_API_KEY') and config.GOOGLE_API_KEY:
            kwargs["api_key"] = config.GOOGLE_API_KEY
    # 可按需添加更多 provider

    return kwargs
```

## 6.3 `_get_agent()` 方法适配

`_build_subagent_middleware()` 现在是 `async` 方法，需要在 `_get_agent()` 中 `await`：

```diff
  async def _get_agent(self):
      if self._agent is None:
          middleware = []

-         subagent_mw = self._build_subagent_middleware()
+         subagent_mw = await self._build_subagent_middleware()  # 现在是 async
          if subagent_mw:
              middleware.append(subagent_mw)

          # ... 其余不变
```

> **注意**：`_get_agent()` 本身已经是 `async` 方法，改动仅增加一个 `await`。

## 6.4 改动影响分析

| 方法 | 改动程度 | 说明 |
|------|---------|------|
| `_build_subagent_middleware()` | 中等 | 改为 async，新增 MCP 工具加载和完整 model 构建 |
| `_get_subagent_mcp_tools()` | 新增 | 复用现有 MCPClientManager |
| `_build_subagent_model()` | 新增 | 支持多 provider |
| `_get_model_kwargs_for_provider()` | 新增 | 从 `_get_model_kwargs()` 泛化 |
| `_get_agent()` | 极小 | 增加一个 `await` |
| `chat()` | 无改动 | — |
| `chat_stream()` | 无改动 | — |
| `get_history()` | 无改动 | — |

**总改动：约 80 行新代码 + 5 行修改**。核心逻辑不变。

## 6.5 运行时架构图

```
主 Agent (model=openai:gpt-4o)
  │
  ├── 内置工具: [web_search, read_file]
  ├── MCP 工具: [google_search]  ← 主 Agent 自己的 MCP
  │
  └── SubAgentMiddleware
        ├── task tool (LangChain BaseTool)
        │     当主 Agent 调用 task(description, subagent_type) 时:
        │
        ├── SubAgent "搜索专家"
        │     ├── model: openai:gpt-4o-mini  ← 独立 model
        │     ├── 内置工具: [web_search]
        │     └── MCP 工具: [bing_search]  ← ✅ SubAgent 自己的 MCP！
        │
        └── SubAgent "代码专家"
              ├── model: anthropic:claude-4-sonnet  ← ✅ 不同 provider！
              ├── 内置工具: [read_file, grep, edit_file]
              └── MCP 工具: [github_pr, github_issues]  ← ✅ SubAgent 自己的 MCP！
```

## 6.6 deepagents 库兼容性确认

`deepagents.SubAgent` TypedDict 接口：

```python
class SubAgent(TypedDict):
    name: str
    description: str
    system_prompt: str
    tools: Sequence[BaseTool | Callable | dict]
    model: NotRequired[str | BaseChatModel]  # ← 支持 str 或 BaseChatModel 实例
```

- `model` 字段接受 `BaseChatModel` 实例 → 我们可以传入 `init_chat_model()` 返回的实例
- `tools` 字段接受 `BaseTool` 列表 → MCP 工具返回的就是 `BaseTool`
- **完全兼容，无需修改 deepagents 库**
