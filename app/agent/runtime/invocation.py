"""Per-request invocation context for DeepAgentService."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator, Optional
from uuid import UUID

from app.agent.runtime.common import parse_topic_id_from_thread
from app.agent.tools.context import agent_session_id, agent_topic_id, agent_user_id
from app.config import config


@dataclass(frozen=True)
class InvocationContext:
    """Dynamic request context for one agent invocation."""

    thread_id: str
    user_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    recursion_limit: int = config.AGENT_RECURSION_LIMIT

    @property
    def topic_id(self) -> Optional[UUID]:
        return parse_topic_id_from_thread(self.thread_id)

    def build_graph_config(self) -> dict[str, Any]:
        cfg: dict[str, Any] = {
            "configurable": {"thread_id": self.thread_id},
            "recursion_limit": self.recursion_limit,
        }

        if self.user_id:
            cfg["configurable"]["user_id"] = str(self.user_id)

        if self.session_id:
            cfg.setdefault("metadata", {})["assistant_id"] = str(self.session_id)

        return cfg

    @contextmanager
    def bind_tool_context(self) -> Iterator[None]:
        """Bind ContextVars used by built-in tools during one invocation."""
        token_uid = agent_user_id.set(self.user_id)
        token_sid = agent_session_id.set(self.session_id)
        token_tid = agent_topic_id.set(self.topic_id)
        try:
            yield
        finally:
            agent_user_id.reset(token_uid)
            agent_session_id.reset(token_sid)
            agent_topic_id.reset(token_tid)
