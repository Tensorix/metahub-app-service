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
from deepagents.backends import CompositeBackend, StoreBackend
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore
from langgraph.types import Command

from app.config import config
from app.agent.tools.context import agent_user_id, agent_session_id, agent_topic_id

logger = logging.getLogger(__name__)


def _parse_topic_id_from_thread(thread_id: str) -> Optional[UUID]:
    """Parse topic_id from thread_id when format is topic_{uuid}."""
    if not thread_id or not isinstance(thread_id, str):
        return None
    if not thread_id.startswith("topic_"):
        return None
    suffix = thread_id[6:]  # len("topic_") == 6
    if not suffix:
        return None
    try:
        return UUID(suffix)
    except (ValueError, TypeError):
        return None


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


def _unwrap_exception(e: BaseException) -> BaseException:
    """Extract the root cause from nested ExceptionGroups.

    When MCP tools fail inside anyio.TaskGroup, the real error (e.g.
    httpx.HTTPStatusError) gets wrapped in one or more ExceptionGroup
    layers.  This helper drills down to the first leaf exception so
    that log messages and user-facing errors are actually useful.
    """
    while isinstance(e, BaseExceptionGroup) and e.exceptions:
        e = e.exceptions[0]
    return e


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
                - skills: List of skill content objects [{name, content}]
                - memory: List of memory file paths
            checkpointer: Optional PostgreSQL checkpointer for persistence
            store: Optional PostgreSQL store for long-term memory
        """
        self.config = agent_config
        self.checkpointer = checkpointer
        self.store = store
        self._agent = None
        self._mounted_files: dict[str, dict] = {}  # AGENTS.md + skills for thread store

    def _build_skill_files(self) -> tuple[list[str], dict[str, dict]]:
        """Build skill source paths and files dict from config.

        Converts skill content objects [{name, content}] from the database
        into the file format expected by deepagents SkillsMiddleware.

        Skills are written to the thread-scoped store before each invoke
        so SkillsMiddleware discovers them via backend.ls_info("/skills/").

        Returns:
            Tuple of (skills_source_paths, files_dict):
            - skills_source_paths: e.g. ["/skills/"] for create_deep_agent
            - files_dict: e.g. {"/skills/research/SKILL.md": {content, ...}}
        """
        skills_data = self.config.get("skills") or []
        if not skills_data:
            return [], {}

        from deepagents.backends.utils import create_file_data

        files = {}
        for skill in skills_data:
            name = skill.get("name") if isinstance(skill, dict) else getattr(skill, "name", None)
            content = skill.get("content") if isinstance(skill, dict) else getattr(skill, "content", None)
            if not name or not content:
                logger.warning(f"Skipping invalid skill entry: {skill}")
                continue
            path = f"/skills/{name}/SKILL.md"
            files[path] = create_file_data(content)

        if files:
            logger.info(f"Prepared {len(files)} skill(s): {list(files.keys())}")

        return ["/skills/"] if files else [], files

    def _build_agents_memory_file(self) -> dict[str, dict]:
        """Build root AGENTS.md file data from memory config."""
        memory_data = self.config.get("memory") or []
        if not memory_data:
            return {}

        memory_content = ""
        for item in memory_data:
            name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
            content = item.get("content") if isinstance(item, dict) else getattr(item, "content", None)
            normalized = (name or "").strip().lower().removesuffix(".md")
            if normalized == "agents":
                memory_content = content or ""
                break
            if not memory_content and content:
                memory_content = content

        if not memory_content:
            return {}

        from deepagents.backends.utils import create_file_data
        return {"/AGENTS.md": create_file_data(memory_content)}

    def _build_mounted_files(self) -> tuple[list[str], dict[str, dict]]:
        """Build all mounted files (AGENTS.md + skills) for thread store.

        Returns:
            Tuple of (skills_source_paths, mounted_files_dict).
        """
        skills_paths, skill_files = self._build_skill_files()
        agents_md = self._build_agents_memory_file()

        mounted = {}
        mounted.update(agents_md)
        mounted.update(skill_files)
        return skills_paths, mounted

    def _build_default_system_prompt(self) -> str:
        """Build a context-aware default system prompt.

        Layered architecture:
        1. Identity & core behavior — WHO the agent is and HOW it works
        2. Tool usage strategy — WHEN and HOW to use each tool
        3. Dynamic capabilities — MCP, SubAgents (conditional)
        4. AGENTS.md bootstrap — READ instructions first (conditional)
        5. Skills guidance — progressive disclosure (conditional)
        6. Quality constraints — guardrails and validation rules

        The actual content of AGENTS.md and skills is stored in the
        virtual filesystem — this prompt provides behavioral guidance
        and instructs the agent to read them proactively.
        """
        parts = []

        # ── Layer 1: Identity & Core Behavior ──
        parts.append(
            "You are an AI agent that helps users complete tasks.\n"
            "\n"
            "## Core Behavior\n"
            "- Keep working until the task is fully resolved before yielding back to the user.\n"
            "- Do not ask for confirmation on assumptions — act on them and adjust if proven wrong.\n"
            "- When blocked, try alternative approaches before asking the user.\n"
            "- For complex tasks, use `write_todos` to break them into steps and track progress.\n"
            "- Verify your changes are correct before reporting completion."
        )

        # ── Layer 2: Tool Usage Strategy ──
        tool_lines = [
            "",
            "## Tools",
            "You have these tools. Use the right tool for each job:",
            "- **read_file**: Read file content. ALWAYS read a file before editing it.",
            "- **edit_file**: Modify existing files (preferred over write_file for existing files).",
            "- **write_file**: Create new files only.",
            "- **glob**: Search for files by name pattern.",
            "- **grep**: Search file contents by text or regex.",
            "- **ls**: List directory contents to understand project structure.",
            "- **write_todos / read_todos**: Plan and track multi-step tasks.",
            "",
            "When multiple tool calls are independent of each other, call them in parallel for efficiency.",
        ]
        parts.append("\n".join(tool_lines))

        # ── Layer 3: Dynamic Capabilities ──
        mcp_servers = self.config.get("mcp_servers") or []
        if mcp_servers:
            parts.append(
                "\n### MCP Tools\n"
                "Additional tools are dynamically loaded from configured MCP servers. "
                "Use them when they match the task better than built-in tools."
            )

        subagents = self.config.get("subagents") or []
        if subagents:
            sa_names = [sa.get("name", "unnamed") for sa in subagents]
            parts.append(
                "\n### Sub-Agents\n"
                f"Use the `task` tool to delegate work to specialized sub-agents: {', '.join(sa_names)}.\n"
                "Delegate when a subtask clearly falls within a sub-agent's specialty, "
                "or when you need to parallelize independent work."
            )

        # ── Layer 4: AGENTS.md Bootstrap ──
        has_memory = bool(self.config.get("memory"))
        if has_memory:
            parts.append(
                "\n## Agent Instructions (AGENTS.md)\n"
                "CRITICAL: At the START of every new conversation, you MUST use `read_file` to read `/AGENTS.md` "
                "BEFORE taking any other action. This file contains the user's persistent instructions, "
                "role definitions, and domain knowledge that govern your behavior.\n"
                "\n"
                "Rules from AGENTS.md take PRIORITY over the default behavior described above. "
                "If AGENTS.md defines a specific persona, workflow, or constraint, follow it exactly."
            )

        # ── Layer 5: Skills ──
        has_skills = bool(self.config.get("skills"))
        if has_skills:
            parts.append(
                "\n## Skills\n"
                "You have a skills library at `/skills/`. When a user's request matches a skill:\n"
                "1. Use `read_file` to read the skill's `SKILL.md` at its full path IMMEDIATELY.\n"
                "2. Follow the skill's step-by-step workflow exactly.\n"
                "3. Use any supporting files referenced by the skill.\n"
                "\n"
                "Skills provide proven, structured approaches — always prefer them over ad-hoc solutions."
            )

        # ── Layer 6: Quality Constraints ──
        parts.append(
            "\n## Quality Rules\n"
            "- **Read before write**: Never edit or overwrite a file you haven't read first.\n"
            "- **Verify after change**: After making edits, confirm the result is correct.\n"
            "- **Be concise**: Explain what you did and the result. Avoid unnecessary preambles.\n"
            "- **Stay focused**: Only make changes directly relevant to the user's request."
        )

        return "\n".join(parts)

    def _build_user_message(
        self,
        raw_message: str,
        *,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
        thread_id: Optional[str] = None,
        extra_context: Optional[dict[str, Any]] = None,
    ) -> str:
        """Wrap raw user message with runtime context.

        Injects environment info and user rules into the user message
        using XML tags so the LLM can distinguish system context from
        actual user intent. This is the "auto-generated user prompt"
        layer — analogous to Cursor's <user_info>, <rules>, etc.

        Args:
            raw_message: The user's original text.
            user_id: Current user ID.
            session_id: Current session ID.
            thread_id: Current thread ID.
            extra_context: Optional dict with additional context fields:
                - user_name: Display name of the user.
                - workspace: Project or workspace description.
                - user_rules: Custom rules/preferences to follow.
                - datetime: ISO timestamp (auto-filled if omitted).
                - Any other key-value pairs to include.

        Returns:
            Enriched message string with XML-tagged context sections.
        """
        ctx = extra_context or {}
        sections: list[str] = []

        # ── Environment ──
        env_lines: list[str] = []
        if ctx.get("user_name"):
            env_lines.append(f"User: {ctx['user_name']}")
        if ctx.get("workspace"):
            env_lines.append(f"Workspace: {ctx['workspace']}")
        dt = ctx.get("datetime") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        env_lines.append(f"Date: {dt}")
        if thread_id:
            env_lines.append(f"Thread: {thread_id}")

        if env_lines:
            sections.append("<environment>\n" + "\n".join(env_lines) + "\n</environment>")

        # ── User Rules / Preferences ──
        user_rules = ctx.get("user_rules")
        if user_rules:
            sections.append(f"<rules>\n{user_rules}\n</rules>")

        # ── User Query (always last) ──
        sections.append(f"<user_query>\n{raw_message}\n</user_query>")

        return "\n\n".join(sections)

    async def _write_mounted_files_to_store(self, thread_id: str):
        """Write mounted files to thread-scoped store before invoke.

        Uses store.aput (upsert) so it's safe to call on every invoke.
        Files are stored in namespace (thread_id, "filesystem").
        """
        if not self.store or not self._mounted_files:
            return

        namespace = (str(thread_id), "filesystem")
        for path, file_data in self._mounted_files.items():
            await self.store.aput(namespace, path, file_data)

        logger.debug(
            f"Wrote {len(self._mounted_files)} mounted file(s) to "
            f"thread store namespace={namespace}"
        )

    def _get_model_string(self) -> str:
        """Build provider:model format string.

        Uses ``_resolved_sdk`` (the LangChain-compatible provider type) instead
        of ``model_provider`` (which is the registry ID) so that custom registry
        names like ``"newapi"`` are mapped to a known SDK such as ``"openai"``.
        """
        model = self.config.get("model") or config.AGENT_DEFAULT_MODEL
        # If model already contains ":", use as-is
        if ":" in model:
            return model
        sdk = self.config.get("_resolved_sdk") or self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        return f"{sdk}:{model}"

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
        Build CompositeBackend with two-tier lifecycle storage.

        Routes:
        - /workspace/* → StoreBackend (session lifecycle, namespace=(session_id, "filesystem"))
        - All others  → ThreadScopedStoreBackend (thread lifecycle, namespace=(thread_id, "filesystem"))

        Root files (AGENTS.md, skills, agent temp files) are per-thread and visible
        in the frontend via thread_id. Workspace files are per-session and shared
        across all threads.
        """
        if not self.store:
            return None

        def backend_factory(runtime):
            from app.agent.backends import ThreadScopedStoreBackend

            return CompositeBackend(
                default=ThreadScopedStoreBackend(runtime),
                routes={"/workspace/": StoreBackend(runtime)},
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

            sdk = sa_config.get("_resolved_sdk") or model_provider
            model_string = (
                model_name if ":" in model_name
                else f"{sdk}:{model_name}"
            )

            # Use subagent's own _resolved_* first (injected by factory)
            kwargs = {}
            sa_key = sa_config.get("_resolved_api_key")
            sa_url = sa_config.get("_resolved_base_url")
            if sa_key:
                kwargs["api_key"] = sa_key
            if sa_url:
                kwargs["base_url"] = sa_url

            # Fallback to parent/env resolution
            if not kwargs:
                kwargs = self._get_model_kwargs_for_provider(sdk)

            return init_chat_model(model_string, **kwargs)
        else:
            # 没有独立 provider — 使用父 Agent 的 provider
            # 返回 model name，由 SubAgentMiddleware 的 default_model 提供 provider
            return model_name

    def _get_model_kwargs_for_provider(self, sdk: str) -> dict:
        """获取指定 sdk 类型的 model kwargs。

        ``sdk`` is the LangChain-compatible provider type (e.g. "openai"),
        NOT the registry ID. For the parent agent's own sdk, reuses
        _resolved_* values first. Falls back to env vars.
        """
        kwargs = {}

        # Check if this is the same sdk as the parent agent — reuse resolved values
        parent_sdk = self.config.get("_resolved_sdk") or self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        if sdk == parent_sdk:
            resolved_key = self.config.get("_resolved_api_key")
            resolved_url = self.config.get("_resolved_base_url")
            if resolved_key:
                kwargs["api_key"] = resolved_key
            if resolved_url:
                kwargs["base_url"] = resolved_url

        # Env var fallbacks (match on sdk type)
        if sdk == "openai":
            if "api_key" not in kwargs and config.OPENAI_API_KEY:
                kwargs["api_key"] = config.OPENAI_API_KEY
            if "base_url" not in kwargs and config.OPENAI_BASE_URL:
                kwargs["base_url"] = config.OPENAI_BASE_URL
        elif sdk == "anthropic":
            if "api_key" not in kwargs and hasattr(config, 'ANTHROPIC_API_KEY') and config.ANTHROPIC_API_KEY:
                kwargs["api_key"] = config.ANTHROPIC_API_KEY
        elif sdk == "google":
            if "api_key" not in kwargs and hasattr(config, 'GOOGLE_API_KEY') and config.GOOGLE_API_KEY:
                kwargs["api_key"] = config.GOOGLE_API_KEY

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

        Priority: _resolved_* from provider registry > env vars.
        Returns kwargs to pass to init_chat_model.
        """
        sdk = self.config.get("_resolved_sdk") or self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        kwargs = {}

        # Priority 1: Pre-resolved from provider registry (injected by factory)
        resolved_key = self.config.get("_resolved_api_key")
        resolved_url = self.config.get("_resolved_base_url")

        if resolved_key:
            kwargs["api_key"] = resolved_key
        if resolved_url:
            kwargs["base_url"] = resolved_url

        # Priority 2: Env vars as fallback (match on sdk type, not registry ID)
        if "api_key" not in kwargs and sdk == "openai" and config.OPENAI_API_KEY:
            kwargs["api_key"] = config.OPENAI_API_KEY
        if "base_url" not in kwargs and sdk == "openai" and config.OPENAI_BASE_URL:
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
                or self._build_default_system_prompt(),
                "subagents": subagents,  # create_deep_agent 会自动创建 SubAgentMiddleware
                "middleware": [],  # 不需要手动添加 middleware，create_deep_agent 会自动添加
                "checkpointer": self.checkpointer,
                "store": self.store,
                "backend": self._build_backend(),
                "name": self.config.get("name"),
            }

            # 人机协作：需人工批准的工具 (interrupt_on)
            interrupt_on = self.config.get("interrupt_on") or {}
            if interrupt_on:
                agent_kwargs["interrupt_on"] = interrupt_on

            # Mounted files: AGENTS.md + skills for thread store
            skills_paths, self._mounted_files = self._build_mounted_files()
            if skills_paths:
                agent_kwargs["skills"] = skills_paths

            # Memory (persistent context from AGENTS.md files)
            # TODO: Implement virtual filesystem for memory stored in database
            # memory = self.config.get("memory")
            # if memory:
            #     agent_kwargs["memory"] = memory

            logger.info(
                f"Creating deep agent: model={model_string}, "
                f"tools={len(builtin_tools)} builtin + {len(mcp_tools)} mcp, "
                f"subagents={len(subagents)}, "
                f"mounted_files={len(self._mounted_files)}"
            )

            self._agent = create_deep_agent(**agent_kwargs)
        return self._agent

    async def chat(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
        extra_context: Optional[dict[str, Any]] = None,
    ) -> str:
        """
        Send a message and get a complete response.

        Args:
            message: User message
            thread_id: Conversation thread ID
            user_id: Optional user ID for context
            session_id: Optional session ID for filesystem isolation
            extra_context: Optional runtime context (user_name, workspace, user_rules, etc.)

        Returns:
            Complete AI response text
        """
        # 设置工具运行时上下文
        token_uid = agent_user_id.set(user_id)
        token_sid = agent_session_id.set(session_id)
        topic_id = _parse_topic_id_from_thread(thread_id)
        token_tid = agent_topic_id.set(topic_id)
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

            # Write AGENTS.md + skills to thread store so SkillsMiddleware
            # discovers them via backend.ls_info("/skills/")
            await self._write_mounted_files_to_store(thread_id)

            enriched = self._build_user_message(
                message,
                user_id=user_id,
                session_id=session_id,
                thread_id=thread_id,
                extra_context=extra_context,
            )
            input_data = {"messages": [{"role": "user", "content": enriched}]}
            response = await agent.ainvoke(input_data, config=cfg)

            # Extract the last AI message
            messages = response.get("messages", [])
            for msg in reversed(messages):
                if isinstance(msg, AIMessage) or getattr(msg, "type", None) == "ai":
                    return msg.content
            return ""
        finally:
            agent_user_id.reset(token_uid)
            agent_session_id.reset(token_sid)
            agent_topic_id.reset(token_tid)

    async def chat_stream(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
        extra_context: Optional[dict[str, Any]] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Send a message and stream the response.

        Args:
            message: User message
            thread_id: Conversation thread ID
            user_id: Optional user ID for context
            session_id: Optional session ID for filesystem isolation
            extra_context: Optional runtime context (user_name, workspace, user_rules, etc.)

        Yields:
            Event dictionaries with types:
                - message: Text content chunk
                - operation_start: Tool/SubAgent invocation started
                - operation_end: Tool/SubAgent invocation completed
                - done: Stream complete
                - error: Error occurred
        """
        # 设置工具运行时上下文
        token_uid = agent_user_id.set(user_id)
        token_sid = agent_session_id.set(session_id)
        topic_id = _parse_topic_id_from_thread(thread_id)
        token_tid = agent_topic_id.set(topic_id)
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

            # Write AGENTS.md + skills to thread store so SkillsMiddleware
            # discovers them via backend.ls_info("/skills/")
            await self._write_mounted_files_to_store(thread_id)

            try:
                event_count = 0
                # 追踪活跃的 SubAgent op_id，用于过滤内部事件
                _active_subagent_op_ids = set()

                enriched = self._build_user_message(
                    message,
                    user_id=user_id,
                    session_id=session_id,
                    thread_id=thread_id,
                    extra_context=extra_context,
                )
                input_data = {"messages": [{"role": "user", "content": enriched}]}

                async for event in agent.astream_events(
                    input_data,
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

                # 检查是否有人机协作中断：astream_events 遇 interrupt 会结束流，通过 get_state 判断
                if self.config.get("interrupt_on"):
                    try:
                        state = await agent.aget_state(cfg)
                        if state and hasattr(state, "tasks") and state.tasks:
                            for task in state.tasks:
                                interrupts = getattr(task, "interrupts", None) or []
                                for intr in interrupts:
                                    val = getattr(intr, "value", None)
                                    if isinstance(val, dict):
                                        ar = val.get("action_requests", [])
                                        rc = val.get("review_configs", [])
                                        if ar:
                                            yield {
                                                "event": "interrupt",
                                                "data": {
                                                    "action_requests": ar,
                                                    "review_configs": rc,
                                                },
                                            }
                                            yield {"event": "done", "data": {"status": "interrupt"}}
                                            return
                    except Exception as e:
                        logger.debug(f"Interrupt check: {e}")

                yield {"event": "done", "data": {"status": "complete"}}

            except Exception as e:
                root = _unwrap_exception(e)
                logger.error(f"Error in agent stream: {root}", exc_info=True)
                yield {"event": "error", "data": {"error": str(root)}}
        finally:
            agent_user_id.reset(token_uid)
            agent_session_id.reset(token_sid)
            agent_topic_id.reset(token_tid)

    async def chat_resume(
        self,
        thread_id: str,
        decisions: list[dict],
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Resume agent execution after human-in-the-loop approval.

        Args:
            thread_id: Conversation thread ID (must match the interrupted chat)
            decisions: User decisions per action_request, e.g. [{"type": "approve"}, {"type": "reject"}]
            user_id: Optional user ID for context
            session_id: Optional session ID for StorageBackend

        Yields:
            Same event format as chat_stream
        """
        token_uid = agent_user_id.set(user_id)
        token_sid = agent_session_id.set(session_id)
        topic_id = _parse_topic_id_from_thread(thread_id)
        token_tid = agent_topic_id.set(topic_id)
        try:
            agent = await self._get_agent()
            cfg = {
                "configurable": {"thread_id": thread_id},
                "recursion_limit": config.AGENT_RECURSION_LIMIT,
            }
            if user_id:
                cfg["configurable"]["user_id"] = str(user_id)
            if session_id:
                cfg.setdefault("metadata", {})["assistant_id"] = str(session_id)

            await self._write_mounted_files_to_store(thread_id)

            resume_input = Command(resume={"decisions": decisions})
            _active_subagent_op_ids: set = set()

            async for event in agent.astream_events(resume_input, config=cfg, version="v2"):
                event_type = event.get("event")
                event_data = event.get("data", {})
                op_id = event.get("run_id") or str(id(event))
                now_iso = datetime.now(timezone.utc).isoformat()

                if event_type == "on_tool_start" and event.get("name") == "task":
                    tool_input = event_data.get("input", {})
                    subagent_name = tool_input.get("subagent_type", "unknown")
                    _active_subagent_op_ids.add(op_id)
                    yield {
                        "event": "operation_start",
                        "data": {
                            "op_id": op_id,
                            "op_type": "subagent",
                            "name": subagent_name,
                            "description": tool_input.get("description", ""),
                            "started_at": now_iso,
                        },
                    }
                    continue
                if event_type == "on_tool_end" and event.get("name") == "task":
                    result_str = _safe_serialize(event_data.get("output", ""))
                    _active_subagent_op_ids.discard(op_id)
                    yield {
                        "event": "operation_end",
                        "data": {
                            "op_id": op_id,
                            "op_type": "subagent",
                            "name": "task",
                            "result": result_str,
                            "success": True,
                            "ended_at": now_iso,
                        },
                    }
                    continue
                if _active_subagent_op_ids and event.get("parent_ids"):
                    if any(pid in _active_subagent_op_ids for pid in event.get("parent_ids", [])):
                        continue
                if op_id in _active_subagent_op_ids:
                    continue

                if event_type == "on_chat_model_stream":
                    chunk = event_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield {"event": "message", "data": {"content": chunk.content}}
                elif event_type == "on_tool_start":
                    tool_input = event_data.get("input", {})
                    if isinstance(tool_input, dict):
                        safe_input = {}
                        for k, v in tool_input.items():
                            try:
                                json.dumps(v)
                                safe_input[k] = v
                            except (TypeError, ValueError):
                                safe_input[k] = str(v)
                        tool_input = safe_input
                    else:
                        tool_input = {}
                    yield {
                        "event": "operation_start",
                        "data": {
                            "op_id": op_id,
                            "op_type": "tool",
                            "name": event.get("name", "unknown"),
                            "args": tool_input,
                            "started_at": now_iso,
                        },
                    }
                elif event_type == "on_tool_end":
                    result_str = _safe_serialize(event_data.get("output", ""))
                    yield {
                        "event": "operation_end",
                        "data": {
                            "op_id": op_id,
                            "op_type": "tool",
                            "name": event.get("name", "unknown"),
                            "result": result_str,
                            "success": True,
                            "ended_at": now_iso,
                        },
                    }

            yield {"event": "done", "data": {"status": "complete"}}
        except Exception as e:
            root = _unwrap_exception(e)
            logger.error(f"Error in chat_resume: {root}", exc_info=True)
            yield {"event": "error", "data": {"error": str(root)}}
        finally:
            agent_user_id.reset(token_uid)
            agent_session_id.reset(token_sid)
            agent_topic_id.reset(token_tid)

    async def append_assistant_message(
        self,
        thread_id: str,
        content: str,
        user_id: Optional[UUID] = None,
    ) -> None:
        """
        Append an assistant message to the checkpointer for a thread.
        Used by scheduled tasks so their messages appear in LLM context.

        Args:
            thread_id: Conversation thread ID (e.g. topic_{topic_id})
            content: Assistant message content
            user_id: Optional user ID for config
        """
        if not self.checkpointer:
            logger.debug("No checkpointer, skip append_assistant_message")
            return

        try:
            agent = await self._get_agent()
            cfg = {"configurable": {"thread_id": thread_id}}
            if user_id:
                cfg["configurable"]["user_id"] = str(user_id)

            await agent.aupdate_state(cfg, {"messages": [AIMessage(content=content)]})
            logger.debug(f"Appended assistant message to checkpointer for thread {thread_id}")
        except Exception as e:
            logger.warning(f"Failed to append assistant message to checkpointer: {e}")

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
