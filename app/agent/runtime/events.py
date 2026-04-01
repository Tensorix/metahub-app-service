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
        self._streamed_text_ops: set[str] = set()
        self._streamed_thinking_ops: set[str] = set()

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
            payload = self._translate_chat_model_stream_chunk(chunk, op_id=op_id)
            return payload

        if event_type == "on_chat_model_end":
            payload: list[dict[str, Any]] = []
            if op_id not in self._streamed_thinking_ops:
                fallback_thinking = self._extract_reasoning_from_chat_output(event_data.get("output"))
                if fallback_thinking:
                    payload.append({"event": "thinking", "data": {"content": fallback_thinking}})
            if op_id not in self._streamed_text_ops:
                fallback_text = self._extract_text_from_chat_output(event_data.get("output"))
                if fallback_text:
                    payload.append({"event": "message", "data": {"content": fallback_text}})
            usage = extract_usage_metadata(event_data.get("output"))
            if usage:
                payload.append(
                    {
                        "event": "metrics",
                        "data": {
                            **usage,
                            "input_token_source": "reported",
                            "output_token_source": "reported",
                            "total_token_source": "reported",
                        },
                    }
                )
            self._streamed_text_ops.discard(op_id)
            self._streamed_thinking_ops.discard(op_id)
            return payload

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
        op_id = self._normalize_op_id(event)

        if event_type == "on_chat_model_end":
            payload: list[dict[str, Any]] = []
            if op_id not in self._streamed_thinking_ops:
                fallback_thinking = self._extract_reasoning_from_chat_output(event_data.get("output"))
                if fallback_thinking:
                    payload.append(
                        {
                            "event": "thinking",
                            "data": {
                                "content": fallback_thinking,
                                "parent_op_id": parent_op_id,
                            },
                        }
                    )
            if op_id not in self._streamed_text_ops:
                fallback_text = self._extract_text_from_chat_output(event_data.get("output"))
                if fallback_text:
                    payload.append(
                        {
                            "event": "message",
                            "data": {
                                "content": fallback_text,
                                "parent_op_id": parent_op_id,
                            },
                        }
                    )
            usage = extract_usage_metadata(event_data.get("output"))
            if usage:
                payload.append(
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
                )
            self._streamed_text_ops.discard(op_id)
            self._streamed_thinking_ops.discard(op_id)
            return payload

        if event_type == "on_chat_model_stream":
            chunk = event_data.get("chunk")
            payload = self._translate_chat_model_stream_chunk(
                chunk,
                op_id=op_id,
                parent_op_id=parent_op_id,
            )
            return payload

        if event_type == "on_tool_start":
            return [
                {
                    "event": "operation_start",
                    "data": {
                        "op_id": op_id,
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
                        "op_id": op_id,
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
    def _extract_text_from_chat_output(output: Any) -> str:
        """Extract human-readable text from a chat model end payload."""
        if output is None:
            return ""

        generations = getattr(output, "generations", None)
        if generations:
            texts: list[str] = []
            for generation_group in generations:
                for generation in generation_group or []:
                    message = getattr(generation, "message", None)
                    if message is None:
                        continue
                    content = getattr(message, "content", "")
                    if isinstance(content, str) and content:
                        texts.append(content)
            return "".join(texts)

        messages = getattr(output, "messages", None)
        if messages:
            texts = [
                getattr(message, "content", "")
                for message in messages
                if isinstance(getattr(message, "content", None), str) and getattr(message, "content", "")
            ]
            return "".join(texts)

        content = getattr(output, "content", None)
        if isinstance(content, str):
            return content

        return ""

    def _translate_chat_model_stream_chunk(
        self,
        chunk: Any,
        *,
        op_id: str,
        parent_op_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if not chunk:
            return []

        payload: list[dict[str, Any]] = []
        reasoning = self._extract_reasoning_from_chunk(chunk)
        if reasoning:
            self._streamed_thinking_ops.add(op_id)
            data: dict[str, Any] = {"content": reasoning}
            if parent_op_id:
                data["parent_op_id"] = parent_op_id
            payload.append({"event": "thinking", "data": data})

        content = getattr(chunk, "content", None)
        if content:
            self._streamed_text_ops.add(op_id)
            data = {"content": content}
            if parent_op_id:
                data["parent_op_id"] = parent_op_id
            payload.append({"event": "message", "data": data})

        return payload

    @staticmethod
    def _extract_reasoning_from_chunk(chunk: Any) -> str:
        if chunk is None:
            return ""

        additional_kwargs = getattr(chunk, "additional_kwargs", None)
        if isinstance(additional_kwargs, dict):
            reasoning = additional_kwargs.get("reasoning_content")
            if isinstance(reasoning, str):
                return reasoning

        return ""

    @staticmethod
    def _extract_reasoning_from_chat_output(output: Any) -> str:
        if output is None:
            return ""

        generations = getattr(output, "generations", None)
        if generations:
            segments: list[str] = []
            for generation_group in generations:
                for generation in generation_group or []:
                    message = getattr(generation, "message", None)
                    if message is None:
                        continue
                    additional_kwargs = getattr(message, "additional_kwargs", None)
                    if not isinstance(additional_kwargs, dict):
                        continue
                    reasoning = additional_kwargs.get("reasoning_content")
                    if isinstance(reasoning, str) and reasoning:
                        segments.append(reasoning)
            return "".join(segments)

        messages = getattr(output, "messages", None)
        if messages:
            segments = []
            for message in messages:
                additional_kwargs = getattr(message, "additional_kwargs", None)
                if not isinstance(additional_kwargs, dict):
                    continue
                reasoning = additional_kwargs.get("reasoning_content")
                if isinstance(reasoning, str) and reasoning:
                    segments.append(reasoning)
            return "".join(segments)

        additional_kwargs = getattr(output, "additional_kwargs", None)
        if isinstance(additional_kwargs, dict):
            reasoning = additional_kwargs.get("reasoning_content")
            if isinstance(reasoning, str):
                return reasoning

        return ""

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
