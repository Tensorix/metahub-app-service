# app/agent/tools/context.py

"""Context variables for agent tool execution.

Provides runtime context (user_id, session_id) to built-in tools
without polluting tool signatures or requiring global state.
"""

from contextvars import ContextVar
from typing import Optional
from uuid import UUID

# Agent runtime context — set by DeepAgentService before tool execution
agent_user_id: ContextVar[Optional[UUID]] = ContextVar(
    "agent_user_id", default=None
)
agent_session_id: ContextVar[Optional[UUID]] = ContextVar(
    "agent_session_id", default=None
)
