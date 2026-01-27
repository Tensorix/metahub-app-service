"""
Deep Agent Service - Core agent implementation using deepagents library.

Uses deepagents for agent orchestration with:
- Streaming responses via SSE
- PostgreSQL checkpointer for persistence
- SubAgents for task delegation
- Built-in filesystem tools (ls, read_file, write_file, edit_file, glob, grep)
- Built-in planning tools (write_todos, read_todos)
- CompositeBackend for memory routing
"""

import logging
from typing import Any, AsyncGenerator, Optional
from uuid import UUID

from deepagents import create_deep_agent, SubAgent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.middleware import SubAgentMiddleware, SummarizationMiddleware
from langchain_core.messages import AIMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore

from app.config import config

logger = logging.getLogger(__name__)


class DeepAgentService:
    """Deep Agent service for AI conversations with streaming support."""

    def __init__(
        self,
        agent_config: dict[str, Any],
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[AsyncPostgresStore] = None,
    ):
        """
        Initialize the Deep Agent service.

        Args:
            agent_config: Agent configuration including:
                - name: Agent name
                - model: Model name (e.g., "gpt-4o-mini")
                - model_provider: Provider name (e.g., "openai")
                - system_prompt: System prompt for the agent
                - tools: List of tool names to enable
                - temperature: Model temperature (default: 0.7)
                - max_tokens: Max tokens (default: 4096)
                - subagents: List of subagent configurations
                - skills: List of skill directory paths
                - memory: List of memory file paths
            checkpointer: Optional PostgreSQL checkpointer for persistence
            store: Optional PostgreSQL store for long-term memory
        """
        self.config = agent_config
        self.checkpointer = checkpointer
        self.store = store
        self._agent = None

    def _get_model_string(self) -> str:
        """Build provider:model format string."""
        model = self.config.get("model") or config.AGENT_DEFAULT_MODEL
        provider = self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        # If model already contains ":", use as-is
        return model if ":" in model else f"{provider}:{model}"

    def _get_tools(self) -> list:
        """Get custom tools based on configuration."""
        from app.agent.tools import ToolRegistry

        tool_names = self.config.get("tools") or []
        return ToolRegistry.get_tools(tool_names)

    def _build_backend(self):
        """
        Build CompositeBackend with persistent memory routes.

        Routes:
        - /memories/* → StoreBackend (persistent, cross-conversation)
        - All others → StateBackend (ephemeral, conversation-scoped)
        """
        if not self.store:
            return None

        # Return a factory function that creates backends with runtime
        def backend_factory(runtime):
            return CompositeBackend(
                default=StateBackend(runtime),
                routes={"/memories/": StoreBackend(runtime)}
            )
        
        return backend_factory

    def _build_subagent_middleware(self) -> Optional[SubAgentMiddleware]:
        """
        Build SubAgentMiddleware with configured subagents.

        Subagents enable task delegation and context isolation.
        Each subagent has its own tools, model, and system prompt.
        """
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
                model=sa.get("model"),  # Optional, inherits from parent if None
            )
            subagents.append(subagent)

        # SubAgentMiddleware requires default_model for subagents without explicit model
        return SubAgentMiddleware(
            subagents=subagents,
            default_model=self._get_model_string()
        )

    def _get_model_kwargs(self) -> dict:
        """
        Build model-specific kwargs including API keys.
        
        Returns kwargs to pass to init_chat_model.
        """
        provider = self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        kwargs = {}
        
        # Add provider-specific API keys from config
        if provider == "openai":
            if config.OPENAI_API_KEY:
                kwargs["api_key"] = config.OPENAI_API_KEY
            if config.OPENAI_BASE_URL:
                kwargs["base_url"] = config.OPENAI_BASE_URL
        
        return kwargs

    def _build_summarization_middleware(self) -> Optional[SummarizationMiddleware]:
        """
        Build summarization middleware for conversation compression.
        
        When conversation exceeds max_messages, automatically generates summary
        and keeps only recent messages.
        """
        summarization_config = self.config.get("summarization", {})
        
        if not summarization_config or not summarization_config.get("enabled", False):
            return None
        
        return SummarizationMiddleware(
            max_messages=summarization_config.get("max_messages", 50),
            keep_last_n=summarization_config.get("keep_last_n", 20),
            summary_prompt=summarization_config.get("summary_prompt"),
            model=summarization_config.get("model"),
        )

    def _get_agent(self):
        """
        Create deep agent with all features enabled.

        Built-in tools (auto-enabled):
        - Planning: write_todos, read_todos
        - Filesystem: ls, read_file, write_file, edit_file, glob, grep
        - SubAgent: task (if subagents configured)
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

            # Build model with explicit API key
            from langchain.chat_models import init_chat_model
            model_string = self._get_model_string()
            model_kwargs = self._get_model_kwargs()
            
            # Create model instance with API key
            model = init_chat_model(model_string, **model_kwargs)

            # Agent kwargs
            agent_kwargs = {
                "model": model,  # Pass model instance instead of string
                "tools": self._get_tools(),
                "system_prompt": self.config.get("system_prompt") or (
                    "You are a helpful AI assistant with access to planning tools "
                    "(write_todos, read_todos) and file system tools "
                    "(ls, read_file, write_file, edit_file, glob, grep)."
                ),
                "middleware": middleware,
                "checkpointer": self.checkpointer,
                "store": self.store,
                "backend": self._build_backend(),
                "name": self.config.get("name"),
            }

            # Skills (reusable workflows from SKILL.md files)
            # TODO: Implement virtual filesystem for skills stored in database
            # skills = self.config.get("skills")
            # if skills:
            #     agent_kwargs["skills"] = skills

            # Memory (persistent context from AGENTS.md files)
            # TODO: Implement virtual filesystem for memory stored in database
            # memory = self.config.get("memory")
            # if memory:
            #     agent_kwargs["memory"] = memory

            logger.info(
                f"Creating deep agent: model={model_string}, "
                f"tools={len(agent_kwargs['tools'])} custom, "
                f"middleware={len(middleware)}, "
                f"subagents={len(subagent_mw.subagents) if subagent_mw else 0}"
            )

            self._agent = create_deep_agent(**agent_kwargs)

        return self._agent

    async def chat(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> str:
        """
        Send a message and get a complete response.

        Args:
            message: User message
            thread_id: Conversation thread ID
            user_id: Optional user ID for context
            session_id: Optional session ID for filesystem isolation

        Returns:
            Complete AI response text
        """
        agent = self._get_agent()
        cfg = {"configurable": {"thread_id": thread_id}}

        if user_id:
            cfg["configurable"]["user_id"] = str(user_id)
        
        # Enable session-level filesystem isolation
        if session_id:
            if "metadata" not in cfg:
                cfg["metadata"] = {}
            cfg["metadata"]["assistant_id"] = str(session_id)

        response = await agent.ainvoke(
            {"messages": [{"role": "user", "content": message}]},
            config=cfg,
        )

        # Extract the last AI message
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
        session_id: Optional[UUID] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Send a message and stream the response.

        Args:
            message: User message
            thread_id: Conversation thread ID
            user_id: Optional user ID for context
            session_id: Optional session ID for filesystem isolation

        Yields:
            Event dictionaries with types:
                - message: Text content chunk
                - tool_call: Tool invocation (including built-in tools)
                - tool_result: Tool execution result
                - done: Stream complete
                - error: Error occurred
        """
        agent = self._get_agent()
        cfg = {"configurable": {"thread_id": thread_id}}

        if user_id:
            cfg["configurable"]["user_id"] = str(user_id)
        
        # Enable session-level filesystem isolation
        if session_id:
            if "metadata" not in cfg:
                cfg["metadata"] = {}
            cfg["metadata"]["assistant_id"] = str(session_id)

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

                logger.debug(f"Agent event #{event_count}: {event_type}")

                if event_type == "on_chat_model_stream":
                    # Streaming text chunk
                    chunk = event_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        logger.debug(f"Yielding message chunk: {chunk.content[:50]}")
                        yield {
                            "event": "message",
                            "data": {"content": chunk.content},
                        }

                elif event_type == "on_tool_start":
                    # Tool invocation started (custom or built-in)
                    tool_name = event.get("name", "unknown")
                    tool_input = event_data.get("input", {})
                    logger.info(f"Tool call: {tool_name}")
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
                    logger.info(f"Tool result: {event.get('name', 'unknown')}")
                    yield {
                        "event": "tool_result",
                        "data": {
                            "name": event.get("name", "unknown"),
                            "result": str(tool_output) if tool_output else "",
                        },
                    }

            logger.info(f"Agent stream completed, total events: {event_count}")
            yield {"event": "done", "data": {"status": "complete"}}

        except Exception as e:
            logger.error(f"Error in agent stream: {str(e)}", exc_info=True)
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
            msg_type = getattr(msg, "type", None)
            if msg_type == "human":
                history.append({"role": "user", "content": msg.content})
            elif msg_type == "ai":
                history.append({"role": "assistant", "content": msg.content})
            elif msg_type == "system":
                history.append({"role": "system", "content": msg.content})

        return history
