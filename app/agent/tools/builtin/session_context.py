# app/agent/tools/builtin/session_context.py

"""
Session context tools - List and get user sessions and topics.

Enables the agent to resolve "other session" intent (e.g. "schedule a message
to the chat with 小明") by querying sessions and topics.
"""

from typing import Optional
from uuid import UUID

from app.agent.tools.context import agent_user_id
from app.agent.tools.registry import ToolRegistry
from app.db.session import SessionLocal
from app.schema.session import SessionListQuery
from app.service.session import SessionService, TopicService


def _get_user_id() -> Optional[UUID]:
    return agent_user_id.get()


def _session_to_str(s) -> str:
    """Format a session for LLM-readable output."""
    name = s.name or "(unnamed)"
    return f"id={s.id} name={name!r} type={s.type} source={s.source or '-'}"


def _topic_to_str(t) -> str:
    """Format a topic for LLM-readable output."""
    name = t.name or "(unnamed)"
    return f"id={t.id} name={name!r}"


@ToolRegistry.register(
    name="list_sessions",
    description=(
        "List the current user's sessions (chats). Supports pagination and filtering. "
        "Use name_contains to search by session name (e.g. for 'chat with 小明' use name_contains='小明'). "
        "Use session_type to filter: 'ai' for AI chats, 'pm' for private messages, 'group' for group chats."
    ),
    category="session",
)
def list_sessions(
    page: int = 1,
    size: int = 20,
    session_type: Optional[str] = None,
    source: Optional[str] = None,
    name_contains: Optional[str] = None,
) -> str:
    """
    List the current user's sessions.

    Args:
        page: Page number (default 1).
        size: Page size (default 20, max 200).
        session_type: Filter by type: "ai", "pm", "group".
        source: Filter by source.
        name_contains: Fuzzy search by session name.

    Returns:
        Human-readable list of sessions with id, name, type, source.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    if size > 200:
        size = 200

    try:
        query = SessionListQuery(
            page=page,
            size=size,
            type=session_type,
            source=source,
            name_contains=name_contains,
        )
        with SessionLocal() as db:
            sessions, total = SessionService.get_sessions(db, query, user_id)
            if not sessions:
                return f"No sessions found (total: {total})."

            lines = [f"Sessions ({len(sessions)} of {total}):"]
            for s in sessions:
                lines.append(f"  - {_session_to_str(s)}")
            return "\n".join(lines)
    except Exception as e:
        return f"Error listing sessions: {e}"


@ToolRegistry.register(
    name="get_session",
    description="Get a single session by ID. Returns id, name, type, source.",
    category="session",
)
def get_session(session_id: str) -> str:
    """
    Get a session by ID.

    Args:
        session_id: UUID of the session.

    Returns:
        Session details or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        sid = UUID(session_id.strip())
    except (TypeError, ValueError):
        return f"Error: Invalid session_id: {session_id}"

    try:
        with SessionLocal() as db:
            session = SessionService.get_session(db, sid, user_id)
            if not session:
                return f"Session {session_id} not found."
            return _session_to_str(session)
    except Exception as e:
        return f"Error: {e}"


@ToolRegistry.register(
    name="list_topics",
    description=(
        "List topics for a session. Only relevant for AI sessions (which have multiple topics). "
        "PM/group sessions do not have topics."
    ),
    category="session",
)
def list_topics(session_id: str) -> str:
    """
    List topics for a session.

    Args:
        session_id: UUID of the session.

    Returns:
        List of topics (id, name) or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        sid = UUID(session_id.strip())
    except (TypeError, ValueError):
        return f"Error: Invalid session_id: {session_id}"

    try:
        with SessionLocal() as db:
            # Verify session exists and belongs to user
            session = SessionService.get_session(db, sid, user_id)
            if not session:
                return f"Session {session_id} not found."
            topics = TopicService.get_topics_by_session(db, sid, user_id)
            if not topics:
                return f"No topics found for session {session_id}."
            lines = [f"Topics for session {session_id}:"]
            for t in topics:
                lines.append(f"  - {_topic_to_str(t)}")
            return "\n".join(lines)
    except Exception as e:
        return f"Error: {e}"
