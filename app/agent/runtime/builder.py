"""Agent construction helpers for DeepAgentService."""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import uuid4

from deepagents import SubAgent, create_deep_agent
from deepagents.backends import CompositeBackend, StoreBackend
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore

from app.config import config

logger = logging.getLogger(__name__)


class AgentBuilder:
    """Build the deep agent and its runtime dependencies."""

    def __init__(
        self,
        agent_config: dict[str, Any],
        bootstrap_provider,
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[AsyncPostgresStore] = None,
    ) -> None:
        self.config = agent_config
        self.bootstrap_provider = bootstrap_provider
        self.checkpointer = checkpointer
        self.store = store

    def _build_default_system_prompt(self) -> str:
        return (
            "You are an AI agent that helps users complete tasks.\n"
            "\n"
            "## Core Behavior\n"
            "- Keep working until the task is fully resolved before yielding back to the user.\n"
            "- Do not ask for confirmation on assumptions — act on them and adjust if proven wrong.\n"
            "- When blocked, try alternative approaches before asking the user.\n"
            "- Verify your changes are correct before reporting completion.\n"
            "\n"
            "## Tools\n"
            "- **read_file**: Read file content. ALWAYS read a file before editing it.\n"
            "- **edit_file**: Modify existing files (preferred over write_file for existing files).\n"
            "- **write_file**: Create new files only.\n"
            "- **glob**: Search for files by name pattern.\n"
            "- **grep**: Search file contents by text or regex.\n"
            "- **ls**: List directory contents.\n"
            "- **write_todos / read_todos**: Plan and track multi-step tasks.\n"
            "\n"
            "Call independent tools in parallel for efficiency.\n"
            "\n"
            "## Quality Rules\n"
            "- **Read before write**: Never edit a file you haven't read first.\n"
            "- **Verify after change**: Confirm the result is correct after edits.\n"
            "- **Be concise**: Explain what you did, not what you're about to do.\n"
            "- **Stay focused**: Only make changes directly relevant to the request."
        )

    def _apply_generation_params(self, target: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
        if cfg.get("temperature") is not None:
            target["temperature"] = cfg["temperature"]
        if cfg.get("max_tokens") is not None:
            target["max_tokens"] = cfg["max_tokens"]
        return target

    def _get_model_string(self) -> str:
        model = self.config.get("model") or config.AGENT_DEFAULT_MODEL
        if ":" in model:
            return model
        sdk = self.config.get("_resolved_sdk") or self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        return f"{sdk}:{model}"

    def _get_model_kwargs_for_provider(
        self,
        sdk: str,
        cfg: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        cfg = cfg or self.config
        kwargs: dict[str, Any] = {}

        resolved_key = cfg.get("_resolved_api_key")
        resolved_url = cfg.get("_resolved_base_url")
        if resolved_key:
            kwargs["api_key"] = resolved_key
        if resolved_url:
            kwargs["base_url"] = resolved_url

        parent_sdk = self.config.get("_resolved_sdk") or self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        if not kwargs and cfg is not self.config and sdk == parent_sdk:
            if self.config.get("_resolved_api_key"):
                kwargs["api_key"] = self.config["_resolved_api_key"]
            if self.config.get("_resolved_base_url"):
                kwargs["base_url"] = self.config["_resolved_base_url"]

        if sdk == "openai":
            if "api_key" not in kwargs and config.OPENAI_API_KEY:
                kwargs["api_key"] = config.OPENAI_API_KEY
            if "base_url" not in kwargs and config.OPENAI_BASE_URL:
                kwargs["base_url"] = config.OPENAI_BASE_URL
        elif sdk == "anthropic":
            if "api_key" not in kwargs and getattr(config, "ANTHROPIC_API_KEY", None):
                kwargs["api_key"] = config.ANTHROPIC_API_KEY
        elif sdk == "google":
            if "api_key" not in kwargs and getattr(config, "GOOGLE_API_KEY", None):
                kwargs["api_key"] = config.GOOGLE_API_KEY

        return self._apply_generation_params(kwargs, cfg)

    def _get_model_kwargs(self) -> dict[str, Any]:
        sdk = self.config.get("_resolved_sdk") or self.config.get("model_provider") or config.AGENT_DEFAULT_PROVIDER
        return self._get_model_kwargs_for_provider(sdk, self.config)

    def _get_tools(self) -> list:
        from app.agent.tools import ToolRegistry

        tool_names = self.config.get("tools") or []
        return ToolRegistry.get_tools(tool_names)

    async def _get_mcp_tools(self) -> list:
        mcp_servers = self.config.get("mcp_servers") or []
        if not mcp_servers:
            return []

        from app.agent.mcp import get_mcp_client_manager

        manager = get_mcp_client_manager()
        agent_id = self.config.get("_agent_id") or uuid4()
        if "_agent_id" not in self.config:
            logger.warning("No agent_id in config, MCP tool cache disabled")

        try:
            tools = await manager.get_tools(agent_id, mcp_servers)
            logger.info("Loaded %s MCP tools", len(tools))
            return tools
        except Exception as exc:
            logger.error("Failed to load MCP tools: %s", exc)
            return []

    @staticmethod
    def _merge_tools(builtin_tools: list, mcp_tools: list) -> list:
        builtin_names = {tool.name for tool in builtin_tools}
        merged = list(builtin_tools)

        for tool in mcp_tools:
            if tool.name in builtin_names:
                logger.warning("MCP tool '%s' conflicts with built-in tool, skipped", tool.name)
                continue
            merged.append(tool)
            builtin_names.add(tool.name)

        return merged

    def _build_backend(self):
        if not self.store:
            return None

        def backend_factory(runtime):
            from app.agent.backends import ThreadScopedStoreBackend

            return CompositeBackend(
                default=ThreadScopedStoreBackend(runtime),
                routes={"/workspace/": StoreBackend(runtime)},
            )

        return backend_factory

    async def _get_subagent_mcp_tools(self, sa_config: dict[str, Any]) -> list:
        mcp_servers = sa_config.get("mcp_servers") or []
        if not mcp_servers:
            return []

        from app.agent.mcp import get_mcp_client_manager

        manager = get_mcp_client_manager()
        agent_id = sa_config.get("_agent_id") or uuid4()
        if "_agent_id" not in sa_config:
            logger.warning("SubAgent '%s' has no _agent_id, MCP tool cache disabled", sa_config.get("name"))

        try:
            tools = await manager.get_tools(agent_id, mcp_servers)
            logger.info("SubAgent '%s': loaded %s MCP tools", sa_config.get("name"), len(tools))
            return tools
        except Exception as exc:
            logger.error("SubAgent '%s': failed to load MCP tools: %s", sa_config.get("name"), exc)
            return []

    def _build_subagent_model(self, sa_config: dict[str, Any]):
        model_name = sa_config.get("model")
        model_provider = sa_config.get("model_provider")
        if not model_name:
            return None

        if not model_provider:
            return model_name

        sdk = sa_config.get("_resolved_sdk") or model_provider
        model_string = model_name if ":" in model_name else f"{sdk}:{model_name}"
        model_kwargs = self._get_model_kwargs_for_provider(sdk, sa_config)
        return init_chat_model(model_string, **model_kwargs)

    async def _build_subagents(self) -> list:
        subagent_records = self.config.get("subagents") or []
        if not subagent_records:
            return []

        from app.agent.tools import ToolRegistry

        subagents = []
        for sa_config in subagent_records:
            builtin_tools = ToolRegistry.get_tools(sa_config.get("tools") or [])
            mcp_tools = await self._get_subagent_mcp_tools(sa_config)
            tools = self._merge_tools(builtin_tools, mcp_tools)
            model = self._build_subagent_model(sa_config)
            subagents.append(
                SubAgent(
                    name=sa_config["name"],
                    description=sa_config["description"],
                    system_prompt=sa_config.get("system_prompt", ""),
                    tools=tools,
                    model=model,
                )
            )

        return subagents

    async def build(self):
        model_string = self._get_model_string()
        model = init_chat_model(model_string, **self._get_model_kwargs())
        builtin_tools = self._get_tools()
        mcp_tools = await self._get_mcp_tools()
        all_tools = self._merge_tools(builtin_tools, mcp_tools)
        subagents = await self._build_subagents()

        agent_kwargs: dict[str, Any] = {
            "model": model,
            "tools": all_tools,
            "system_prompt": self.config.get("system_prompt") or self._build_default_system_prompt(),
            "subagents": subagents,
            "middleware": [],
            "checkpointer": self.checkpointer,
            "store": self.store,
            "backend": self._build_backend(),
            "name": self.config.get("name"),
        }

        interrupt_on = self.config.get("interrupt_on") or {}
        if interrupt_on:
            agent_kwargs["interrupt_on"] = interrupt_on

        skills_paths = self.bootstrap_provider.skills_source_paths
        mounted_files = self.bootstrap_provider.mounted_files
        if skills_paths:
            agent_kwargs["skills"] = skills_paths

        logger.info(
            "Creating deep agent: model=%s, tools=%s builtin + %s mcp, subagents=%s, mounted_files=%s",
            model_string,
            len(builtin_tools),
            len(mcp_tools),
            len(subagents),
            len(mounted_files),
        )
        return create_deep_agent(**agent_kwargs)
