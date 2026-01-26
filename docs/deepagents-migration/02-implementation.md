# DeepAgents Implementation Steps

## 实际 API 分析 (v0.3.8)

### `create_deep_agent` 完整签名

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="openai:gpt-4o-mini",           # 模型字符串或 BaseChatModel
    tools=[...],                           # 自定义工具列表
    system_prompt="...",                   # 系统提示词
    middleware=[...],                      # 中间件列表
    subagents=[...],                       # 子代理列表
    skills=["./skills/"],                  # 技能目录路径列表
    memory=["./AGENTS.md"],                # 记忆文件路径列表
    response_format=None,                  # 结构化输出格式
    context_schema=None,                   # 上下文 Schema
    checkpointer=checkpointer,             # 检查点保存器
    store=store,                           # 存储后端
    backend=backend,                       # 文件系统后端
    interrupt_on=None,                     # 人机交互中断配置
    debug=False,                           # 调试模式
    name="my-agent",                       # Agent 名称
    cache=None,                            # 缓存
)
```

### 可用中间件

```python
from deepagents.middleware import (
    FilesystemMiddleware,    # 文件系统工具
    MemoryMiddleware,        # 持久化记忆
    SkillsMiddleware,        # 技能工作流
    SubAgentMiddleware,      # 子代理委派
    SummarizationMiddleware, # 对话摘要
)
```

### 可用后端

```python
from deepagents.backends import (
    StateBackend,       # 临时状态存储
    StoreBackend,       # 持久化存储
    FilesystemBackend,  # 真实文件系统
    CompositeBackend,   # 混合路由
)
```

---

## Step 1: 切换到 `create_deep_agent`

### 1.1 更新 Imports

```python
# app/agent/deep_agent_service.py
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.middleware import SubAgentMiddleware
```

### 1.2 实现 `_build_backend()`

```python
def _build_backend(self):
    """Build CompositeBackend with persistent memory routes."""
    if not self.store:
        return None

    return CompositeBackend(
        default=lambda rt: StateBackend(rt),
        routes={"/memories/": lambda rt: StoreBackend(rt)}
    )
```

### 1.3 实现 `_build_subagent_middleware()`

```python
def _build_subagent_middleware(self):
    """Build SubAgentMiddleware with configured subagents."""
    subagent_records = self.config.get("subagents") or []
    if not subagent_records:
        return None

    from deepagents import SubAgent

    subagents = []
    for sa in subagent_records:
        subagent = SubAgent(
            name=sa["name"],
            description=sa["description"],
            system_prompt=sa.get("system_prompt", ""),
            tools=ToolRegistry.get_tools(sa.get("tools") or []),
            model=sa.get("model"),  # Optional, inherits from parent if None
        )
        subagents.append(subagent)

    return SubAgentMiddleware(subagents=subagents)
```

### 1.4 更新 `_get_agent()`

```python
def _get_agent(self):
    """Create deep agent with all features enabled."""
    if self._agent is None:
        # Build middleware list
        middleware = []
        subagent_mw = self._build_subagent_middleware()
        if subagent_mw:
            middleware.append(subagent_mw)

        # Build agent kwargs
        agent_kwargs = {
            "model": self._get_model_string(),
            "tools": self._get_tools(),
            "system_prompt": self.config.get("system_prompt") or (
                "You are a helpful AI assistant with file system access."
            ),
            "middleware": middleware,
            "checkpointer": self.checkpointer,
            "store": self.store,
            "backend": self._build_backend(),
            "name": self.config.get("name"),
        }

        # Add skills if configured
        skills = self.config.get("skills")
        if skills:
            agent_kwargs["skills"] = skills

        # Add memory files if configured
        memory = self.config.get("memory")
        if memory:
            agent_kwargs["memory"] = memory

        self._agent = create_deep_agent(**agent_kwargs)

    return self._agent
```

---

## Step 2: 数据库 Schema 扩展

### 2.1 Agent 表新增字段

已完成。需要在 Agent 模型中添加 skills 和 memory 配置支持：

```python
# app/db/model/agent.py
class Agent(Base):
    # ... existing fields ...

    # 新增字段（可选，或存在 metadata_ 中）
    skills: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="技能目录路径列表"
    )
    memory_files: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="记忆文件路径列表"
    )
```

**或者保持在 metadata_ 中：**
```json
{
  "skills": ["./skills/research/", "./skills/coding/"],
  "memory": ["./AGENTS.md", "~/.deepagents/AGENTS.md"]
}
```

### 2.2 Schema 更新

```python
# app/schema/session.py
class AgentBase(BaseModel):
    # ... existing fields ...
    skills: Optional[list[str]] = Field(None, description="技能目录路径列表")
    memory_files: Optional[list[str]] = Field(None, description="记忆文件路径列表")
```

---

## Step 3: Factory 配置转换更新

```python
# app/agent/factory.py
@classmethod
def build_agent_config(cls, agent: "Agent") -> dict[str, Any]:
    """Build agent config dict from ORM model."""
    config = {
        "name": agent.name,
        "model": agent.model,
        "model_provider": agent.model_provider,
        "system_prompt": agent.system_prompt,
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
        "tools": agent.tools or [],
    }

    # Add subagents
    if agent.subagents:
        config["subagents"] = [
            {
                "name": sa.name,
                "description": sa.description,
                "system_prompt": sa.system_prompt,
                "model": sa.model,
                "tools": sa.tools or [],
            }
            for sa in agent.subagents
            if not sa.is_deleted
        ]

    # Add skills and memory from metadata or dedicated fields
    if agent.metadata_:
        config["skills"] = agent.metadata_.get("skills")
        config["memory"] = agent.metadata_.get("memory")

    return config
```

---

## Step 4: 完整 DeepAgentService 重写

```python
"""
Deep Agent Service - Core agent implementation using deepagents library.
"""

import logging
from typing import Any, AsyncGenerator, Optional
from uuid import UUID

from deepagents import create_deep_agent, SubAgent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.middleware import SubAgentMiddleware
from langchain_core.messages import AIMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.memory import InMemoryStore

from app.config import config

logger = logging.getLogger(__name__)


class DeepAgentService:
    """Deep Agent service for AI conversations with streaming support."""

    def __init__(
        self,
        agent_config: dict[str, Any],
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[InMemoryStore] = None,
    ):
        self.config = agent_config
        self.checkpointer = checkpointer
        self.store = store
        self._agent = None

    def _get_model_string(self) -> str:
        """Build provider:model format string."""
        model = self.config.get("model") or config.AGENT_DEFAULT_MODEL
        provider = self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        return model if ":" in model else f"{provider}:{model}"

    def _get_tools(self) -> list:
        """Get tools based on configuration."""
        from app.agent.tools import ToolRegistry
        tool_names = self.config.get("tools") or []
        return ToolRegistry.get_tools(tool_names)

    def _build_backend(self):
        """Build CompositeBackend with persistent memory routes."""
        if not self.store:
            return None

        return CompositeBackend(
            default=lambda rt: StateBackend(rt),
            routes={"/memories/": lambda rt: StoreBackend(rt)}
        )

    def _build_subagent_middleware(self) -> Optional[SubAgentMiddleware]:
        """Build SubAgentMiddleware with configured subagents."""
        subagent_records = self.config.get("subagents") or []
        if not subagent_records:
            return None

        subagents = []
        for sa in subagent_records:
            subagent = SubAgent(
                name=sa["name"],
                description=sa["description"],
                system_prompt=sa.get("system_prompt", ""),
                tools=self._get_tools_for_subagent(sa.get("tools") or []),
                model=sa.get("model"),
            )
            subagents.append(subagent)

        return SubAgentMiddleware(subagents=subagents)

    def _get_tools_for_subagent(self, tool_names: list) -> list:
        """Get tools for a subagent."""
        from app.agent.tools import ToolRegistry
        return ToolRegistry.get_tools(tool_names)

    def _get_agent(self):
        """Create deep agent with all features enabled."""
        if self._agent is None:
            # Build middleware
            middleware = []
            subagent_mw = self._build_subagent_middleware()
            if subagent_mw:
                middleware.append(subagent_mw)

            # Agent kwargs
            agent_kwargs = {
                "model": self._get_model_string(),
                "tools": self._get_tools(),
                "system_prompt": self.config.get("system_prompt") or (
                    "You are a helpful AI assistant."
                ),
                "middleware": middleware,
                "checkpointer": self.checkpointer,
                "store": self.store,
                "backend": self._build_backend(),
                "name": self.config.get("name"),
            }

            # Skills
            skills = self.config.get("skills")
            if skills:
                agent_kwargs["skills"] = skills

            # Memory files
            memory = self.config.get("memory")
            if memory:
                agent_kwargs["memory"] = memory

            self._agent = create_deep_agent(**agent_kwargs)

        return self._agent

    async def chat(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
    ) -> str:
        """Non-streaming chat."""
        agent = self._get_agent()
        cfg = {"configurable": {"thread_id": thread_id}}

        if user_id:
            cfg["configurable"]["user_id"] = str(user_id)

        response = await agent.ainvoke(
            {"messages": [{"role": "user", "content": message}]},
            config=cfg,
        )

        messages = response.get("messages", [])
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) or getattr(msg, "type", None) == "ai":
                return msg.content
        return ""

    async def chat_stream(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Streaming chat."""
        agent = self._get_agent()
        cfg = {"configurable": {"thread_id": thread_id}}

        if user_id:
            cfg["configurable"]["user_id"] = str(user_id)

        logger.info(f"Starting deep agent stream for thread {thread_id}")

        try:
            event_count = 0
            async for event in agent.astream_events(
                {"messages": [{"role": "user", "content": message}]},
                config=cfg,
                version="v2",
            ):
                event_count += 1
                event_type = event.get("event")
                event_data = event.get("data", {})

                if event_type == "on_chat_model_stream":
                    chunk = event_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield {"event": "message", "data": {"content": chunk.content}}

                elif event_type == "on_tool_start":
                    yield {
                        "event": "tool_call",
                        "data": {
                            "name": event.get("name", "unknown"),
                            "args": event_data.get("input", {}),
                        },
                    }

                elif event_type == "on_tool_end":
                    yield {
                        "event": "tool_result",
                        "data": {
                            "name": event.get("name", "unknown"),
                            "result": str(event_data.get("output", "")),
                        },
                    }

            logger.info(f"Stream completed, events: {event_count}")
            yield {"event": "done", "data": {"status": "complete"}}

        except Exception as e:
            logger.error(f"Stream error: {e}", exc_info=True)
            yield {"event": "error", "data": {"error": str(e)}}

    async def get_history(self, thread_id: str, limit: int = 50) -> list[dict]:
        """Get conversation history."""
        if not self.checkpointer:
            return []

        state = await self._get_agent().aget_state(
            {"configurable": {"thread_id": thread_id}}
        )

        if not state or not state.values:
            return []

        history = []
        for msg in state.values.get("messages", [])[-limit:]:
            msg_type = getattr(msg, "type", None)
            if msg_type == "human":
                history.append({"role": "user", "content": msg.content})
            elif msg_type == "ai":
                history.append({"role": "assistant", "content": msg.content})

        return history
```

---

## Completion Checklist

### P0 - 核心迁移 ✅
- [x] 切换到 `create_deep_agent`
- [x] 启用内置工具 (自动启用：write_todos, read_todos, ls, read_file, write_file, edit_file, glob, grep)
- [x] 启用 SubAgentMiddleware

### P1 - 后端系统 ✅
- [x] 实现 CompositeBackend 路由
- [x] 配置 `/memories/` 持久化

### P2 - 扩展功能 ✅
- [x] Skills 系统集成 (通过 `skills` 参数)
- [x] Memory 文件支持 (通过 `memory` 参数)
- [ ] SummarizationMiddleware (未启用)

### P3 - 高级功能
- [ ] FilesystemBackend (真实文件系统访问)
- [ ] 结构化输出 (response_format)
- [ ] 人机交互 (interrupt_on)
