# Step 2: Deep Agent 核心服务

## 1. 目标

- 实现 `DeepAgentService` 核心类
- 实现 `AgentFactory` 工厂类
- 支持流式响应和持久化

## 2. 文件结构

```
app/agent/
├── __init__.py           # 模块导出
├── deep_agent_service.py # 核心服务
└── factory.py            # Agent 工厂
```

## 3. 实现详情

### 3.1 app/agent/__init__.py

```python
"""
Agent Chat module - Deep Agent service for AI conversations.

This module provides:
- DeepAgentService: Core agent service with streaming support
- AgentFactory: Factory for creating agents with different configurations
- Tools registry: Custom tools for agent capabilities
"""

from .deep_agent_service import DeepAgentService
from .factory import AgentFactory

__all__ = ["DeepAgentService", "AgentFactory"]
```

### 3.2 app/agent/deep_agent_service.py

```python
"""
Deep Agent Service - Core agent implementation with streaming support.

Uses LangGraph for agent orchestration with:
- Streaming responses via SSE
- PostgreSQL checkpointer for persistence
- Configurable tools and system prompts
"""

from typing import Any, AsyncGenerator, Optional
from uuid import UUID

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.memory import InMemoryStore

from app.config import config


class DeepAgentService:
    """Deep Agent service for AI conversations with streaming support."""

    def __init__(
        self,
        agent_config: dict[str, Any],
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[InMemoryStore] = None,
    ):
        """
        Initialize the Deep Agent service.

        Args:
            agent_config: Agent configuration including:
                - model: Model name (default: gpt-4o-mini)
                - system_prompt: System prompt for the agent
                - tools: List of tool names to enable
                - temperature: Model temperature (default: 0.7)
            checkpointer: Optional PostgreSQL checkpointer for persistence
            store: Optional memory store for long-term memory
        """
        self.config = agent_config
        self.checkpointer = checkpointer
        self.store = store
        self._agent = None
        self._llm = None

    def _get_llm(self) -> ChatOpenAI:
        """Get or create the LLM instance."""
        if self._llm is None:
            self._llm = ChatOpenAI(
                model=self.config.get("model", config.AGENT_DEFAULT_MODEL),
                temperature=self.config.get("temperature", 0.7),
                api_key=config.OPENAI_API_KEY,
                base_url=config.OPENAI_BASE_URL,
                streaming=True,
                max_tokens=self.config.get("max_tokens", 4096),
            )
        return self._llm

    def _get_tools(self) -> list:
        """Get tools based on configuration."""
        from app.agent.tools import ToolRegistry

        tool_names = self.config.get("tools", [])
        return ToolRegistry.get_tools(tool_names)

    def _get_agent(self):
        """Get or create the agent instance."""
        if self._agent is None:
            llm = self._get_llm()
            tools = self._get_tools()
            system_prompt = self.config.get(
                "system_prompt",
                "You are a helpful AI assistant."
            )

            self._agent = create_react_agent(
                model=llm,
                tools=tools,
                state_modifier=system_prompt,
                checkpointer=self.checkpointer,
                store=self.store,
            )
        return self._agent

    async def chat(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
    ) -> str:
        """
        Send a message and get a complete response.

        Args:
            message: User message
            thread_id: Conversation thread ID
            user_id: Optional user ID for context

        Returns:
            Complete AI response text
        """
        agent = self._get_agent()
        config_dict = {"configurable": {"thread_id": thread_id}}

        if user_id:
            config_dict["configurable"]["user_id"] = str(user_id)

        response = await agent.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=config_dict,
        )

        # Extract the last AI message
        messages = response.get("messages", [])
        for msg in reversed(messages):
            if isinstance(msg, AIMessage):
                return msg.content
        return ""

    async def chat_stream(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Send a message and stream the response.

        Args:
            message: User message
            thread_id: Conversation thread ID
            user_id: Optional user ID for context

        Yields:
            Event dictionaries with types:
                - message: Text content chunk
                - tool_call: Tool invocation
                - tool_result: Tool execution result
                - done: Stream complete
                - error: Error occurred
        """
        agent = self._get_agent()
        config_dict = {"configurable": {"thread_id": thread_id}}

        if user_id:
            config_dict["configurable"]["user_id"] = str(user_id)

        try:
            async for event in agent.astream_events(
                {"messages": [HumanMessage(content=message)]},
                config=config_dict,
                version="v2",
            ):
                event_type = event.get("event")
                event_data = event.get("data", {})

                if event_type == "on_chat_model_stream":
                    # Streaming text chunk
                    chunk = event_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield {
                            "event": "message",
                            "data": {"content": chunk.content},
                        }

                elif event_type == "on_tool_start":
                    # Tool invocation started
                    tool_name = event.get("name", "unknown")
                    tool_input = event_data.get("input", {})
                    yield {
                        "event": "tool_call",
                        "data": {
                            "name": tool_name,
                            "args": tool_input,
                        },
                    }

                elif event_type == "on_tool_end":
                    # Tool execution completed
                    tool_output = event_data.get("output", "")
                    yield {
                        "event": "tool_result",
                        "data": {
                            "name": event.get("name", "unknown"),
                            "result": str(tool_output) if tool_output else "",
                        },
                    }

            yield {"event": "done", "data": {"status": "complete"}}

        except Exception as e:
            yield {"event": "error", "data": {"error": str(e)}}

    async def get_history(
        self,
        thread_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Get conversation history for a thread.

        Args:
            thread_id: Conversation thread ID
            limit: Maximum number of messages to return

        Returns:
            List of message dictionaries with role and content
        """
        if not self.checkpointer:
            return []

        config_dict = {"configurable": {"thread_id": thread_id}}
        state = await self._get_agent().aget_state(config_dict)

        if not state or not state.values:
            return []

        messages = state.values.get("messages", [])
        history = []

        for msg in messages[-limit:]:
            if isinstance(msg, HumanMessage):
                history.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                history.append({"role": "assistant", "content": msg.content})
            elif isinstance(msg, SystemMessage):
                history.append({"role": "system", "content": msg.content})

        return history
```

### 3.3 app/agent/factory.py

```python
"""
Agent Factory - Factory for creating and managing agent instances.

Provides:
- Agent instance creation with configuration
- Checkpointer management
- Agent caching and lifecycle
"""

from typing import Any, Optional
from uuid import UUID
import asyncio

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.memory import InMemoryStore

from app.config import config
from app.agent.deep_agent_service import DeepAgentService


class AgentFactory:
    """Factory for creating and managing agent instances."""

    _checkpointer: Optional[AsyncPostgresSaver] = None
    _store: Optional[InMemoryStore] = None
    _agents: dict[str, DeepAgentService] = {}
    _lock = asyncio.Lock()

    @classmethod
    async def get_checkpointer(cls) -> AsyncPostgresSaver:
        """
        Get or create the PostgreSQL checkpointer.

        Returns:
            AsyncPostgresSaver instance
        """
        if cls._checkpointer is None:
            async with cls._lock:
                if cls._checkpointer is None:
                    cls._checkpointer = AsyncPostgresSaver.from_conn_string(
                        config.sqlalchemy_database_uri
                    )
                    await cls._checkpointer.setup()
        return cls._checkpointer

    @classmethod
    def get_store(cls) -> InMemoryStore:
        """
        Get or create the memory store.

        Returns:
            InMemoryStore instance
        """
        if cls._store is None:
            cls._store = InMemoryStore()
        return cls._store

    @classmethod
    async def create_agent(
        cls,
        agent_id: UUID,
        agent_config: dict[str, Any],
        use_checkpointer: bool = True,
        use_store: bool = True,
    ) -> DeepAgentService:
        """
        Create a new agent service instance.

        Args:
            agent_id: Unique agent identifier
            agent_config: Agent configuration from Agent.metadata_
            use_checkpointer: Whether to use PostgreSQL checkpointer
            use_store: Whether to use memory store

        Returns:
            DeepAgentService instance
        """
        cache_key = str(agent_id)

        # Check cache
        if cache_key in cls._agents:
            return cls._agents[cache_key]

        # Get dependencies
        checkpointer = await cls.get_checkpointer() if use_checkpointer else None
        store = cls.get_store() if use_store else None

        # Create agent service
        agent_service = DeepAgentService(
            agent_config=agent_config,
            checkpointer=checkpointer,
            store=store,
        )

        # Cache agent
        cls._agents[cache_key] = agent_service

        return agent_service

    @classmethod
    async def get_agent(
        cls,
        agent_id: UUID,
        agent_config: dict[str, Any],
    ) -> DeepAgentService:
        """
        Get an existing agent or create a new one.

        Args:
            agent_id: Unique agent identifier
            agent_config: Agent configuration

        Returns:
            DeepAgentService instance
        """
        return await cls.create_agent(agent_id, agent_config)

    @classmethod
    def clear_cache(cls, agent_id: Optional[UUID] = None):
        """
        Clear agent cache.

        Args:
            agent_id: Specific agent to clear, or None to clear all
        """
        if agent_id:
            cache_key = str(agent_id)
            if cache_key in cls._agents:
                del cls._agents[cache_key]
        else:
            cls._agents.clear()

    @classmethod
    async def shutdown(cls):
        """
        Shutdown factory and cleanup resources.
        """
        cls._agents.clear()
        if cls._checkpointer:
            # Cleanup checkpointer if needed
            cls._checkpointer = None
        cls._store = None
```

## 4. 关键设计说明

### 4.1 Agent 配置结构

Agent 配置从 `Agent.metadata_` 读取：

```python
agent_config = {
    "model": "deepseek-chat",      # LLM 模型
    "temperature": 0.7,             # 温度参数
    "max_tokens": 4096,             # 最大 token
    "tools": ["search", "calculator"],  # 工具列表
    "system_prompt": "You are a helpful assistant...",  # 系统提示
}
```

### 4.2 Thread ID 设计

Thread ID 用于标识对话线程，推荐使用 Topic ID：

```python
thread_id = f"topic_{topic_id}"  # 或直接使用 str(topic_id)
```

### 4.3 事件类型

| 事件 | 说明 | 数据结构 |
|------|------|----------|
| `message` | 文本块 | `{"content": "..."}` |
| `tool_call` | 工具调用 | `{"name": "...", "args": {...}}` |
| `tool_result` | 工具结果 | `{"name": "...", "result": "..."}` |
| `done` | 完成 | `{"status": "complete"}` |
| `error` | 错误 | `{"error": "..."}` |

### 4.4 Checkpointer 说明

`AsyncPostgresSaver` 自动创建以下表：

- `checkpoints` - 状态检查点
- `checkpoint_writes` - 写入记录
- `checkpoint_blobs` - 大对象存储

首次使用时调用 `setup()` 自动迁移。

## 5. 使用示例

### 5.1 基本使用

```python
from app.agent import AgentFactory

# 获取 agent
agent_config = {
    "model": "deepseek-chat",
    "system_prompt": "You are a helpful assistant.",
}
agent = await AgentFactory.get_agent(agent_id, agent_config)

# 流式对话
async for event in agent.chat_stream("Hello", thread_id="topic_123"):
    if event["event"] == "message":
        print(event["data"]["content"], end="")
    elif event["event"] == "done":
        print("\n--- Done ---")
```

### 5.2 非流式对话

```python
response = await agent.chat("Hello", thread_id="topic_123")
print(response)
```

## 6. 测试

### 6.1 单元测试

```python
# tests/test_agent_service.py
import pytest
from app.agent import DeepAgentService

@pytest.mark.asyncio
async def test_agent_chat():
    agent = DeepAgentService({
        "model": "gpt-4o-mini",
        "system_prompt": "You are a test assistant.",
    })

    response = await agent.chat("Say hello", thread_id="test_1")
    assert len(response) > 0

@pytest.mark.asyncio
async def test_agent_stream():
    agent = DeepAgentService({
        "model": "gpt-4o-mini",
    })

    chunks = []
    async for event in agent.chat_stream("Say hello", thread_id="test_2"):
        if event["event"] == "message":
            chunks.append(event["data"]["content"])

    assert len(chunks) > 0
```

## 7. 下一步

完成核心服务后，进入 [03-BACKEND-API.md](./03-BACKEND-API.md) 实现 API 端点。
