# app/agent/tools/context.py

from contextvars import ContextVar
from typing import Optional
from uuid import UUID

# Agent 运行时上下文
agent_user_id: ContextVar[Optional[UUID]] = ContextVar(
    "agent_user_id", default=None
)
