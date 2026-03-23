"""Shared runtime helpers for DeepAgentService internals."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from langchain_core.messages import ToolMessage
from langgraph.types import Command

logger = logging.getLogger(__name__)


def parse_topic_id_from_thread(thread_id: str) -> Optional[UUID]:
    """Parse topic_id from thread_id when format is topic_{uuid}."""
    if not thread_id or not isinstance(thread_id, str):
        return None
    if not thread_id.startswith("topic_"):
        return None

    suffix = thread_id[6:]
    if not suffix:
        return None

    try:
        return UUID(suffix)
    except (ValueError, TypeError):
        return None


def safe_serialize(value: Any) -> str:
    """Serialize tool outputs for transport to the client."""
    if value is None:
        return ""

    if isinstance(value, Command):
        try:
            messages = value.update.get("messages", [])
            if messages:
                last_msg = messages[-1]
                if isinstance(last_msg, ToolMessage):
                    return str(last_msg.content)
                if hasattr(last_msg, "content"):
                    return str(last_msg.content)
            return str(value)
        except Exception as exc:
            logger.warning("Failed to extract content from Command: %s", exc)
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


def sanitize_tool_input(value: Any) -> dict[str, Any]:
    """Convert tool input into a JSON-safe dict."""
    if not isinstance(value, dict):
        return {}

    safe_input: dict[str, Any] = {}
    for key, item in value.items():
        try:
            json.dumps(item)
            safe_input[key] = item
        except (TypeError, ValueError):
            safe_input[key] = str(item)
    return safe_input


def unwrap_exception(exc: BaseException) -> BaseException:
    """Extract the first leaf exception from nested ExceptionGroups."""
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return exc
