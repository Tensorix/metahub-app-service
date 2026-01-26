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
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
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

            self._agent = create_react_agent(
                model=llm,
                tools=tools,
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

        # Prepare messages with system prompt
        system_prompt = self.config.get("system_prompt", "You are a helpful AI assistant.")
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=message))

        response = await agent.ainvoke(
            {"messages": messages},
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
        import logging
        logger = logging.getLogger(__name__)
        
        agent = self._get_agent()
        config_dict = {"configurable": {"thread_id": thread_id}}

        if user_id:
            config_dict["configurable"]["user_id"] = str(user_id)

        # Prepare messages with system prompt
        system_prompt = self.config.get("system_prompt", "You are a helpful AI assistant.")
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=message))

        logger.info(f"Starting agent stream for thread {thread_id}")

        try:
            event_count = 0
            async for event in agent.astream_events(
                {"messages": messages},
                config=config_dict,
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
                    # Tool invocation started
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
            if isinstance(msg, HumanMessage):
                history.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                history.append({"role": "assistant", "content": msg.content})
            elif isinstance(msg, SystemMessage):
                history.append({"role": "system", "content": msg.content})

        return history
