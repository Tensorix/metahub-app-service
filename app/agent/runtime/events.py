"""Translate LangGraph stream events into frontend-facing transport events."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from app.agent.runtime.common import safe_serialize, sanitize_tool_input
from app.utils.chat_metrics import extract_usage_metadata


class StreamEventTranslator:
    """Stateful translator for LangGraph stream events."""

    def __init__(self, logger: Optional[logging.Logger] = None) -> None:
        self.logger = logger or logging.getLogger(__name__)
        self._active_subagent_op_ids: set[str] = set()

    def _normalize_op_id(self, event: dict[str, Any]) -> str:
        op_id = event.get("run_id")
        if op_id:
            return op_id

        generated = f"op_{uuid4().hex}"
        self.logger.warning("Missing run_id in event '%s', generated op_id=%s", event.get("event"), generated)
        return generated

    def _find_parent_subagent_op_id(self, op_id: str, parent_ids: list[str]) -> str | None:
        """If this event is a child of a subagent, return the parent op_id."""
        if op_id in self._active_subagent_op_ids:
            return None  # This IS the subagent itself, not a child
        for pid in parent_ids:
            if pid in self._active_subagent_op_ids:
                return pid
        return None

    def translate_event(self, event: dict[str, Any]) -> list[dict[str, Any]]:
        event_type = event.get("event")
        event_data = event.get("data", {})
        op_id = self._normalize_op_id(event)
        parent_ids = event.get("parent_ids", [])
        now_iso = datetime.now(timezone.utc).isoformat()

        # --- Subagent lifecycle ---
        if event_type == "on_tool_start" and event.get("name") == "task":
            tool_input = event_data.get("input", {})
            subagent_name = tool_input.get("subagent_type", "unknown")
            self._active_subagent_op_ids.add(op_id)
            return [
                {
                    "event": "operation_start",
                    "data": {
                        "op_id": op_id,
                        "op_type": "subagent",
                        "name": subagent_name,
                        "description": tool_input.get("description", ""),
                        "started_at": now_iso,
                    },
                }
            ]

        if event_type == "on_tool_end" and event.get("name") == "task":
            self._active_subagent_op_ids.discard(op_id)
            return [
                {
                    "event": "operation_end",
                    "data": {
                        "op_id": op_id,
                        "op_type": "subagent",
                        "name": event.get("name", "task"),
                        "result": safe_serialize(event_data.get("output", "")),
                        "success": True,
                        "ended_at": now_iso,
                    },
                }
            ]

        # --- Forward subagent child events (instead of filtering) ---
        parent_op_id = self._find_parent_subagent_op_id(op_id, parent_ids)
        if parent_op_id:
            return self._translate_child_event(event, parent_op_id, now_iso)

        # --- Top-level events ---
        if event_type == "on_chat_model_stream":
            chunk = event_data.get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                return [{"event": "message", "data": {"content": chunk.content}}]
            return []

        if event_type == "on_chat_model_end":
            usage = extract_usage_metadata(event_data.get("output"))
            if usage:
                return [
                    {
                        "event": "metrics",
                        "data": {
                            **usage,
                            "input_token_source": "reported",
                            "output_token_source": "reported",
                            "total_token_source": "reported",
                        },
                    }
                ]
            return []

        if event_type == "on_tool_start":
            return [
                {
                    "event": "operation_start",
                    "data": {
                        "op_id": op_id,
                        "op_type": "tool",
                        "name": event.get("name", "unknown"),
                        "args": sanitize_tool_input(event_data.get("input", {})),
                        "started_at": now_iso,
                    },
                }
            ]

        if event_type == "on_tool_end":
            return [
                {
                    "event": "operation_end",
                    "data": {
                        "op_id": op_id,
                        "op_type": "tool",
                        "name": event.get("name", "unknown"),
                        "result": safe_serialize(event_data.get("output", "")),
                        "success": True,
                        "ended_at": now_iso,
                    },
                }
            ]

        return []

    def _translate_child_event(
        self,
        event: dict[str, Any],
        parent_op_id: str,
        now_iso: str,
    ) -> list[dict[str, Any]]:
        """Translate a subagent internal event into a transport event with parent_op_id."""
        event_type = event.get("event")
        event_data = event.get("data", {})

        if event_type == "on_chat_model_end":
            usage = extract_usage_metadata(event_data.get("output"))
            if usage:
                return [
                    {
                        "event": "metrics",
                        "data": {
                            **usage,
                            "input_token_source": "reported",
                            "output_token_source": "reported",
                            "total_token_source": "reported",
                            "parent_op_id": parent_op_id,
                        },
                    }
                ]
            return []

        if event_type == "on_chat_model_stream":
            chunk = event_data.get("chunk")
            if chunk and hasattr(chunk, "content") and chunk.content:
                return [
                    {
                        "event": "message",
                        "data": {
                            "content": chunk.content,
                            "parent_op_id": parent_op_id,
                        },
                    }
                ]
            return []

        if event_type == "on_tool_start":
            return [
                {
                    "event": "operation_start",
                    "data": {
                        "op_id": self._normalize_op_id(event),
                        "op_type": "tool",
                        "name": event.get("name", "unknown"),
                        "args": sanitize_tool_input(event_data.get("input", {})),
                        "parent_op_id": parent_op_id,
                        "started_at": now_iso,
                    },
                }
            ]

        if event_type == "on_tool_end":
            return [
                {
                    "event": "operation_end",
                    "data": {
                        "op_id": self._normalize_op_id(event),
                        "op_type": "tool",
                        "name": event.get("name", "unknown"),
                        "result": safe_serialize(event_data.get("output", "")),
                        "success": True,
                        "parent_op_id": parent_op_id,
                        "ended_at": now_iso,
                    },
                }
            ]

        return []

    @staticmethod
    def extract_interrupt_payload(state: Any) -> Optional[dict[str, Any]]:
        if not state or not hasattr(state, "tasks") or not state.tasks:
            return None

        for task in state.tasks:
            interrupts = getattr(task, "interrupts", None) or []
            for interrupt in interrupts:
                value = getattr(interrupt, "value", None)
                if not isinstance(value, dict):
                    continue

                action_requests = value.get("action_requests", [])
                review_configs = value.get("review_configs", [])
                if action_requests:
                    return {
                        "event": "interrupt",
                        "data": {
                            "action_requests": action_requests,
                            "review_configs": review_configs,
                        },
                    }

        return None
