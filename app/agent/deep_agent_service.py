"""Deep Agent service facade for AI conversations."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Optional
from uuid import UUID

from langchain_core.messages import AIMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore
from langgraph.types import Command

from app.agent.runtime import (
    AgentBuilder,
    BootstrapContextProvider,
    InvocationContext,
    StreamEventTranslator,
)
from app.agent.runtime.common import unwrap_exception
from app.utils.chat_metrics import extract_usage_metadata

from loguru import logger


class DeepAgentService:
    """Deep Agent service for AI conversations with streaming support."""

    def __init__(
        self,
        agent_config: dict[str, Any],
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[AsyncPostgresStore] = None,
    ) -> None:
        self.config = dict(agent_config)
        self.checkpointer = checkpointer
        self.store = store
        self._agent = None
        self._mounted_files: dict[str, dict] = {}
        self._deprecated_warnings_emitted: set[str] = set()
        self._agent_lock = asyncio.Lock()
        self._bootstrap = BootstrapContextProvider(
            agent_config=self.config,
            checkpointer=self.checkpointer,
            store=self.store,
        )
        self._builder = AgentBuilder(
            agent_config=self.config,
            bootstrap_provider=self._bootstrap,
            checkpointer=self.checkpointer,
            store=self.store,
        )

    # Compatibility shims for older tests and callers that still reach into
    # DeepAgentService internals. New code should use the delegated components.
    def _log_deprecated_usage(self, method_name: str, replacement: str) -> None:
        if method_name in self._deprecated_warnings_emitted:
            return

        logger.warning(
            "DeepAgentService.{0}() is deprecated; use {1} instead.",
            method_name,
            replacement,
        )
        self._deprecated_warnings_emitted.add(method_name)

    def _get_model_string(self) -> str:
        self._log_deprecated_usage("_get_model_string", "AgentBuilder._get_model_string")
        return self._builder._get_model_string()

    def _build_backend(self):
        self._log_deprecated_usage("_build_backend", "AgentBuilder._build_backend")
        return self._builder._build_backend()

    def _build_default_system_prompt(self) -> str:
        self._log_deprecated_usage(
            "_build_default_system_prompt",
            "AgentBuilder._build_default_system_prompt",
        )
        return self._builder._build_default_system_prompt()

    def _build_mounted_files(self) -> tuple[list[str], dict[str, dict]]:
        self._log_deprecated_usage("_build_mounted_files", "BootstrapContextProvider.mounted_files")
        skills_paths = self._bootstrap.skills_source_paths
        self._mounted_files = self._bootstrap.mounted_files
        return skills_paths, dict(self._mounted_files)

    def _build_subagent_middleware(self):
        self._log_deprecated_usage("_build_subagent_middleware", "AgentBuilder.build or AgentBuilder._build_subagents")
        subagents = self.config.get("subagents") or []
        return {"subagents": subagents} if subagents else None

    async def _build_user_message(
        self,
        raw_message: str,
        *,
        bootstrap: bool = False,
        thread_id: str = "",
        session_id: Optional[UUID] = None,
    ) -> str:
        self._log_deprecated_usage("_build_user_message", "BootstrapContextProvider.build_user_message")
        return await self._bootstrap.build_user_message(
            raw_message,
            bootstrap=bootstrap,
            thread_id=thread_id,
            session_id=session_id,
        )

    async def _needs_bootstrap(self, thread_id: str) -> bool:
        self._log_deprecated_usage("_needs_bootstrap", "BootstrapContextProvider.needs_bootstrap")
        return await self._bootstrap.needs_bootstrap(thread_id)

    async def _write_mounted_files_to_store(self, thread_id: str) -> None:
        self._log_deprecated_usage(
            "_write_mounted_files_to_store",
            "BootstrapContextProvider.write_mounted_files_to_store",
        )
        self._mounted_files = self._bootstrap.mounted_files
        await self._bootstrap.write_mounted_files_to_store(thread_id)

    async def _get_agent(self):
        if self._agent is not None:
            return self._agent

        async with self._agent_lock:
            if self._agent is None:
                self._agent = await self._builder.build()
        return self._agent

    async def _prepare_invocation(self, context: InvocationContext):
        agent = await self._get_agent()
        cfg = context.build_graph_config()
        await self._bootstrap.write_mounted_files_to_store(context.thread_id)
        return agent, cfg

    async def _build_message_input(
        self,
        message: str,
        context: InvocationContext,
    ) -> dict[str, Any]:
        is_bootstrap = await self._bootstrap.needs_bootstrap(context.thread_id)
        enriched = await self._bootstrap.build_user_message(
            message,
            bootstrap=is_bootstrap,
            thread_id=context.thread_id,
            session_id=context.session_id,
        )
        return {"messages": [{"role": "user", "content": enriched}]}

    @staticmethod
    def _extract_last_ai_message(response: dict[str, Any]) -> str:
        messages = response.get("messages", [])
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) or getattr(msg, "type", None) == "ai":
                return msg.content
        return ""

    @staticmethod
    def _serialize_input_for_metrics(input_data: dict[str, Any]) -> str:
        messages = input_data.get("messages", [])
        lines: list[str] = []
        for message in messages:
            role = message.get("role", "unknown")
            content = message.get("content", "")
            if isinstance(content, str):
                lines.append(f"{role}: {content}")
                continue
            try:
                serialized = json.dumps(content, ensure_ascii=False)
            except (TypeError, ValueError):
                serialized = str(content)
            lines.append(f"{role}: {serialized}")
        return "\n".join(lines)

    async def prepare_metrics_context(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> dict[str, str]:
        context = InvocationContext(
            thread_id=thread_id,
            user_id=user_id,
            session_id=session_id,
        )
        input_data = await self._build_message_input(message, context)
        system_prompt = self.config.get("system_prompt") or self._builder._build_default_system_prompt()
        return {
            "estimated_input_text": "\n\n".join(
                filter(None, [system_prompt, self._serialize_input_for_metrics(input_data)])
            ),
            "model_name": str(self.config.get("model") or ""),
            "provider": str(
                self.config.get("_resolved_sdk")
                or self.config.get("model_provider")
                or ""
            ),
        }

    async def _stream_request(
        self,
        *,
        agent,
        input_data,
        cfg: dict[str, Any],
        emit_interrupt: bool = False,
    ) -> AsyncGenerator[dict[str, Any], None]:
        translator = StreamEventTranslator(logger)

        async for event in agent.astream_events(input_data, config=cfg, version="v2"):
            for translated in translator.translate_event(event):
                yield translated

        if emit_interrupt:
            try:
                state = await agent.aget_state(cfg)
                interrupt_event = translator.extract_interrupt_payload(state)
                if interrupt_event:
                    yield interrupt_event
                    yield {"event": "done", "data": {"status": "interrupt"}}
                    return
            except Exception as exc:
                logger.debug("Interrupt check failed: %s", exc)

        yield {"event": "done", "data": {"status": "complete"}}

    async def chat(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> str:
        context = InvocationContext(
            thread_id=thread_id,
            user_id=user_id,
            session_id=session_id,
        )

        with context.bind_tool_context():
            agent, cfg = await self._prepare_invocation(context)
            input_data = await self._build_message_input(message, context)
            response = await agent.ainvoke(input_data, config=cfg)
            return self._extract_last_ai_message(response)

    async def chat_with_metrics(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        context = InvocationContext(
            thread_id=thread_id,
            user_id=user_id,
            session_id=session_id,
        )

        with context.bind_tool_context():
            agent, cfg = await self._prepare_invocation(context)
            input_data = await self._build_message_input(message, context)
            response = await agent.ainvoke(input_data, config=cfg)
            return {
                "message": self._extract_last_ai_message(response),
                "usage_metadata": extract_usage_metadata(response),
                "estimated_input_text": "\n\n".join(
                    filter(
                        None,
                        [
                            self.config.get("system_prompt") or self._builder._build_default_system_prompt(),
                            self._serialize_input_for_metrics(input_data),
                        ],
                    )
                ),
                "model_name": str(self.config.get("model") or ""),
                "provider": str(
                    self.config.get("_resolved_sdk")
                    or self.config.get("model_provider")
                    or ""
                ),
            }

    async def chat_stream(
        self,
        message: str,
        thread_id: str,
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        context = InvocationContext(
            thread_id=thread_id,
            user_id=user_id,
            session_id=session_id,
        )

        with context.bind_tool_context():
            try:
                agent, cfg = await self._prepare_invocation(context)
                input_data = await self._build_message_input(message, context)
                logger.info("Starting deep agent stream for thread %s", thread_id)
                async for item in self._stream_request(
                    agent=agent,
                    input_data=input_data,
                    cfg=cfg,
                    emit_interrupt=bool(self.config.get("interrupt_on")),
                ):
                    yield item
            except Exception as exc:
                root = unwrap_exception(exc)
                logger.error("Error in agent stream: %s", root, exc_info=True)
                yield {"event": "error", "data": {"error": str(root)}}

    async def chat_resume(
        self,
        thread_id: str,
        decisions: list[dict],
        user_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        context = InvocationContext(
            thread_id=thread_id,
            user_id=user_id,
            session_id=session_id,
        )

        with context.bind_tool_context():
            try:
                agent, cfg = await self._prepare_invocation(context)
                resume_input = Command(resume={"decisions": decisions})
                async for item in self._stream_request(
                    agent=agent,
                    input_data=resume_input,
                    cfg=cfg,
                    emit_interrupt=False,
                ):
                    yield item
            except Exception as exc:
                root = unwrap_exception(exc)
                logger.error("Error in chat_resume: %s", root, exc_info=True)
                yield {"event": "error", "data": {"error": str(root)}}

    async def append_assistant_message(
        self,
        thread_id: str,
        content: str,
        user_id: Optional[UUID] = None,
    ) -> None:
        if not self.checkpointer:
            logger.debug("No checkpointer, skip append_assistant_message")
            return

        try:
            agent = await self._get_agent()
            cfg = {"configurable": {"thread_id": thread_id}}
            if user_id:
                cfg["configurable"]["user_id"] = str(user_id)

            await agent.aupdate_state(cfg, {"messages": [AIMessage(content=content)]})
            logger.debug("Appended assistant message to checkpointer for thread %s", thread_id)
        except Exception as exc:
            logger.warning("Failed to append assistant message to checkpointer: %s", exc)

    async def get_history(
        self,
        thread_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        if not self.checkpointer:
            return []

        state = await (await self._get_agent()).aget_state({"configurable": {"thread_id": thread_id}})
        if not state or not state.values:
            return []

        history: list[dict[str, Any]] = []
        for msg in state.values.get("messages", [])[-limit:]:
            msg_type = getattr(msg, "type", None)
            if msg_type == "human":
                history.append({"role": "user", "content": msg.content})
            elif msg_type == "ai":
                history.append({"role": "assistant", "content": msg.content})
            elif msg_type == "system":
                history.append({"role": "system", "content": msg.content})

        return history
