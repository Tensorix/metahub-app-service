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
import json
import time
from typing import Any, AsyncGenerator, Optional
from uuid import UUID
from datetime import datetime, timezone

from deepagents import create_deep_agent, SubAgent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore
from langgraph.types import Command

from app.config import config
from app.agent.tools.context import agent_user_id

logger = logging.getLogger(__name__)


def _safe_serialize(value) -> str:
    """安全序列化工具输出为字符串，特别处理 SubAgent 返回的 Command 对象"""
    if value is None:
        return ""
    
    # 处理 SubAgent 返回的 Command 对象
    if isinstance(value, Command):
        try:
            # Command.update['messages'] 包含 ToolMessage 列表
            messages = value.update.get("messages", [])
            if messages:
                last_msg = messages[-1]
                # ToolMessage 的 content 就是 SubAgent 的最终输出
                if isinstance(last_msg, ToolMessage):
                    return str(last_msg.content)
                elif hasattr(last_msg, "content"):
                    return str(last_msg.content)
            # 如果无法提取，返回字符串表示
            return str(value)
        except Exception as e:
            logger.warning(f"Failed to extract content from Command: {e}")
            return str(value)
    
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(value)
    try:
        return str(value)
    except Exception:
        return f"<{type(value).__name__}>"


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

        # 使用 agent_id 作为缓存 key
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

    def _build_backend(self):
        """
        Build CompositeBackend with persistent memory routes.

        Routes:
        - /memories/* → StoreBackend (persistent, cross-conversation, visible to frontend)
        - All others → StateBackend (ephemeral, conversation-scoped, not visible to frontend)
        
        Frontend API can only access files in /memories/ since they are stored in the database.
        Temporary files in other paths only exist during Agent runtime.
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

    async def _build_subagents(self) -> list:
        """Build SubAgent list for create_deep_agent.

        改进：
        1. SubAgent 支持独立的 model_provider → 完整的 provider:model 格式
        2. SubAgent 支持加载自己的 MCP 工具
        3. SubAgent 支持 model_kwargs (API key, base_url 等)
        
        注意：不再手动创建 SubAgentMiddleware，而是返回 SubAgent 列表，
        让 create_deep_agent 自动创建 middleware。
        """
        subagent_records = self.config.get("subagents") or []
        if not subagent_records:
            return []

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

        return subagents

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


    async def _get_agent(self):
        """
        Create deep agent with all features enabled.

        Built-in tools (auto-enabled):
        - Planning: write_todos, read_todos
        - Filesystem: ls, read_file, write_file, edit_file, glob, grep
        - SubAgent: task (if subagents configured)
        - MCP tools: dynamically loaded from configured MCP Servers
        """
        if self._agent is None:
            # Build model with explicit API key
            from langchain.chat_models import init_chat_model

            model_string = self._get_model_string()
            model_kwargs = self._get_model_kwargs()

            # Create model instance with API key
            model = init_chat_model(model_string, **model_kwargs)

            # 获取工具 (内置 + MCP)
            builtin_tools = self._get_tools()
            mcp_tools = await self._get_mcp_tools()
            all_tools = self._merge_tools(builtin_tools, mcp_tools)

            # 构建 subagents 列表（create_deep_agent 会自动创建 SubAgentMiddleware）
            subagents = await self._build_subagents()

            # Agent kwargs
            agent_kwargs = {
                "model": model,  # Pass model instance instead of string
                "tools": all_tools,  # 使用合并后的工具列表
                "system_prompt": self.config.get("system_prompt")
                or (
                    "You are a helpful AI assistant with access to planning tools "
                    "(write_todos, read_todos) and file system tools "
                    "(ls, read_file, write_file, edit_file, glob, grep)."
                ),
                "subagents": subagents,  # create_deep_agent 会自动创建 SubAgentMiddleware
                "middleware": [],  # 不需要手动添加 middleware，create_deep_agent 会自动添加
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
                f"tools={len(builtin_tools)} builtin + {len(mcp_tools)} mcp, "
                f"subagents={len(subagents)}"
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
        # 设置工具运行时上下文
        token = agent_user_id.set(user_id)
        try:
            agent = await self._get_agent()  # 添加 await
            cfg = {
                "configurable": {"thread_id": thread_id},
                "recursion_limit": config.AGENT_RECURSION_LIMIT,  # 增加递归限制,默认是 25
            }

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
        finally:
            agent_user_id.reset(token)

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
                - operation_start: Tool/SubAgent invocation started
                - operation_end: Tool/SubAgent invocation completed
                - done: Stream complete
                - error: Error occurred
        """
        # 设置工具运行时上下文
        token = agent_user_id.set(user_id)
        try:
            agent = await self._get_agent()  # 添加 await
            cfg = {
                "configurable": {"thread_id": thread_id},
                "recursion_limit": config.AGENT_RECURSION_LIMIT,  # 增加递归限制,默认是 25
            }

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
                # 追踪活跃的 SubAgent op_id，用于过滤内部事件
                _active_subagent_op_ids = set()
                
                async for event in agent.astream_events(
                    {"messages": [{"role": "user", "content": message}]},
                    config=cfg,
                    version="v2",
                ):
                    event_count += 1
                    event_loop_ms = int(time.perf_counter() * 1000)
                    event_type = event.get("event")
                    event_data = event.get("data", {})
                    op_id = event.get("run_id")
                    parent_ids = event.get("parent_ids", [])
                    now_iso = datetime.now(timezone.utc).isoformat()

                    if not op_id:
                        from uuid import uuid4

                        op_id = f"op_{uuid4().hex}"
                        logger.warning(
                            f"Missing run_id in event '{event_type}', generated op_id={op_id}"
                        )

                    logger.debug(f"Agent event #{event_count}: {event_type}, op_id={op_id}")

                    # 优先处理 task 工具的 start/end（标记 SubAgent 边界）
                    if event_type == "on_tool_start" and event.get("name") == "task":
                        tool_input = event_data.get("input", {})
                        subagent_name = tool_input.get("subagent_type", "unknown")
                        description = tool_input.get("description", "")
                        _active_subagent_op_ids.add(op_id)
                        logger.info(f"SubAgent delegation START: {subagent_name} (op_id={op_id})")
                        logger.debug(
                            "OP_TRACE source=deep_agent_service phase=emit_start "
                            f"op_id={op_id} op_type=subagent name={subagent_name} "
                            f"event_loop_ms={event_loop_ms} ts={now_iso}"
                        )
                        yield {
                            "event": "operation_start",
                            "data": {
                                "op_id": op_id,
                                "op_type": "subagent",
                                "name": subagent_name,
                                "description": description,
                                "started_at": now_iso,
                            },
                        }
                        continue

                    if event_type == "on_tool_end" and event.get("name") == "task":
                        tool_output = event_data.get("output", "")
                        result_str = _safe_serialize(tool_output)
                        _active_subagent_op_ids.discard(op_id)
                        logger.info(f"SubAgent delegation END (op_id={op_id})")
                        logger.debug(
                            "OP_TRACE source=deep_agent_service phase=emit_end "
                            f"op_id={op_id} op_type=subagent name=task "
                            f"event_loop_ms={event_loop_ms} ts={now_iso}"
                        )
                        yield {
                            "event": "operation_end",
                            "data": {
                                "op_id": op_id,
                                "op_type": "subagent",
                                "name": event.get("name", "task"),
                                "result": result_str,
                                "success": True,
                                "ended_at": now_iso,
                            },
                        }
                        continue

                    # 过滤 SubAgent 内部事件
                    # 方法1: 使用 parent_ids（如果事件的父级在活跃 SubAgent 中，则丢弃）
                    if _active_subagent_op_ids and parent_ids:
                        if any(pid in _active_subagent_op_ids for pid in parent_ids):
                            logger.debug(f"Filtering SubAgent internal event: {event_type}")
                            continue
                    
                    # 方法2: 如果 op_id 本身就在活跃 SubAgent 集合中（说明这是 SubAgent 的直接子事件）
                    if op_id in _active_subagent_op_ids:
                        logger.debug(f"Filtering SubAgent direct child event: {event_type}")
                        continue

                    # 以下是主 Agent 事件的正常处理
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
                        # Tool invocation started (task 已在前面处理)
                        tool_name = event.get("name", "unknown")
                        tool_input = event_data.get("input", {})
                        
                        logger.info(f"Tool call: {tool_name}")
                        
                        # 安全地序列化 tool_input
                        try:
                            if isinstance(tool_input, dict):
                                # 过滤掉不可序列化的值
                                safe_input = {}
                                for key, value in tool_input.items():
                                    try:
                                        json.dumps(value)  # 测试是否可序列化
                                        safe_input[key] = value
                                    except (TypeError, ValueError):
                                        safe_input[key] = str(value)
                                tool_input = safe_input
                        except Exception as e:
                            logger.warning(f"Failed to serialize tool input: {e}")
                            tool_input = {"error": "Failed to serialize input"}
                        
                        yield {
                            "event": "operation_start",
                            "data": {
                                "op_id": op_id,
                                "op_type": "tool",
                                "name": tool_name,
                                "args": tool_input if isinstance(tool_input, dict) else {},
                                "started_at": now_iso,
                            },
                        }
                        logger.debug(
                            "OP_TRACE source=deep_agent_service phase=emit_start "
                            f"op_id={op_id} op_type=tool name={tool_name} "
                            f"event_loop_ms={event_loop_ms} ts={now_iso}"
                        )
                        
                    elif event_type == "on_tool_end":
                        # Tool execution completed (task 已在前面处理)
                        tool_output = event_data.get("output", "")
                        tool_name = event.get("name", "unknown")
                        
                        logger.info(f"Tool result: {tool_name}")
                        result_str = _safe_serialize(tool_output)
                        
                        yield {
                            "event": "operation_end",
                            "data": {
                                "op_id": op_id,
                                "op_type": "tool",
                                "name": tool_name,
                                "result": result_str,
                                "success": True,
                                "ended_at": now_iso,
                            },
                        }
                        logger.debug(
                            "OP_TRACE source=deep_agent_service phase=emit_end "
                            f"op_id={op_id} op_type=tool name={tool_name} "
                            f"event_loop_ms={event_loop_ms} ts={now_iso}"
                        )

                logger.info(f"Agent stream completed, total events: {event_count}")
                yield {"event": "done", "data": {"status": "complete"}}

            except Exception as e:
                logger.error(f"Error in agent stream: {str(e)}", exc_info=True)
                yield {"event": "error", "data": {"error": str(e)}}
        finally:
            agent_user_id.reset(token)

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
        state = await (await self._get_agent()).aget_state(config_dict)  # 添加 await

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
