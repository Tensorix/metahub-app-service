"""Helpers for chat performance metrics extraction and estimation."""

from __future__ import annotations

import math
from typing import Any, Literal, Optional, TypedDict


TokenSource = Literal["reported", "estimated", "unavailable"]


class UsageSummary(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ChatPerformanceMetricsPayload(TypedDict):
    first_token_latency_ms: Optional[int]
    completion_duration_ms: Optional[int]
    total_duration_ms: int
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    total_tokens: Optional[int]
    output_tokens_per_second: Optional[float]
    input_token_source: TokenSource
    output_token_source: TokenSource
    total_token_source: TokenSource


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


def normalize_usage_metadata(value: Any) -> Optional[UsageSummary]:
    """Normalize usage metadata into the standard LangChain token summary."""
    if value is None:
        return None

    if hasattr(value, "model_dump"):
        try:
            value = value.model_dump()
        except Exception:
            pass
    elif hasattr(value, "__dict__") and not isinstance(value, dict):
        value = value.__dict__

    if not isinstance(value, dict):
        return None

    input_tokens = _coerce_int(value.get("input_tokens"))
    output_tokens = _coerce_int(value.get("output_tokens"))
    total_tokens = _coerce_int(value.get("total_tokens"))

    token_usage = value.get("token_usage")
    if isinstance(token_usage, dict):
        input_tokens = input_tokens if input_tokens is not None else _coerce_int(
            token_usage.get("prompt_tokens")
        )
        output_tokens = output_tokens if output_tokens is not None else _coerce_int(
            token_usage.get("completion_tokens")
        )
        total_tokens = total_tokens if total_tokens is not None else _coerce_int(
            token_usage.get("total_tokens")
        )

    usage = value.get("usage")
    if isinstance(usage, dict):
        input_tokens = input_tokens if input_tokens is not None else _coerce_int(
            usage.get("input_tokens") or usage.get("prompt_tokens")
        )
        output_tokens = output_tokens if output_tokens is not None else _coerce_int(
            usage.get("output_tokens") or usage.get("completion_tokens")
        )
        total_tokens = total_tokens if total_tokens is not None else _coerce_int(
            usage.get("total_tokens")
        )

    if input_tokens is None and output_tokens is None and total_tokens is None:
        return None

    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens

    if input_tokens is None and total_tokens is not None and output_tokens is not None:
        input_tokens = max(total_tokens - output_tokens, 0)

    if output_tokens is None and total_tokens is not None and input_tokens is not None:
        output_tokens = max(total_tokens - input_tokens, 0)

    if input_tokens is None or output_tokens is None or total_tokens is None:
        return None

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def extract_usage_metadata(value: Any) -> Optional[UsageSummary]:
    """Extract usage metadata from LangChain message/result payloads."""
    direct = normalize_usage_metadata(value)
    if direct:
        return direct

    usage_metadata = getattr(value, "usage_metadata", None)
    direct = normalize_usage_metadata(usage_metadata)
    if direct:
        return direct

    response_metadata = getattr(value, "response_metadata", None)
    direct = normalize_usage_metadata(response_metadata)
    if direct:
        return direct

    if hasattr(value, "message"):
        direct = extract_usage_metadata(getattr(value, "message"))
        if direct:
            return direct

    messages = getattr(value, "messages", None)
    if messages:
        for item in reversed(messages):
            direct = extract_usage_metadata(item)
            if direct:
                return direct

    generations = getattr(value, "generations", None)
    if generations:
        for generation_group in generations:
            items = generation_group if isinstance(generation_group, list) else [generation_group]
            for item in items:
                direct = extract_usage_metadata(item)
                if direct:
                    return direct

    if isinstance(value, dict):
        for key in ("usage_metadata", "response_metadata", "output", "message", "chunk"):
            direct = extract_usage_metadata(value.get(key))
            if direct:
                return direct
        messages = value.get("messages")
        if messages:
            for item in reversed(messages):
                direct = extract_usage_metadata(item)
                if direct:
                    return direct
        generations = value.get("generations")
        if generations:
            for generation_group in generations:
                items = generation_group if isinstance(generation_group, list) else [generation_group]
                for item in items:
                    direct = extract_usage_metadata(item)
                    if direct:
                        return direct

    return None


def add_usage_summaries(
    left: Optional[UsageSummary],
    right: Optional[UsageSummary],
) -> Optional[UsageSummary]:
    if left is None:
        return right
    if right is None:
        return left
    return {
        "input_tokens": left["input_tokens"] + right["input_tokens"],
        "output_tokens": left["output_tokens"] + right["output_tokens"],
        "total_tokens": left["total_tokens"] + right["total_tokens"],
    }


def estimate_token_count(
    text: str,
    *,
    model_name: Optional[str] = None,
    provider: Optional[str] = None,
) -> Optional[int]:
    """Estimate token count with model-aware tokenization when possible."""
    if not text:
        return 0

    normalized_provider = (provider or "").strip().lower()
    if normalized_provider in {"", "openai", "azure-openai", "bedrock"}:
        try:
            import tiktoken

            encoding_name = "cl100k_base"
            if model_name:
                try:
                    encoder = tiktoken.encoding_for_model(model_name)
                except KeyError:
                    encoder = tiktoken.get_encoding(encoding_name)
            else:
                encoder = tiktoken.get_encoding(encoding_name)
            return len(encoder.encode(text))
        except Exception:
            pass

    compact = " ".join(text.split())
    if not compact:
        return 0
    return max(1, math.ceil(len(compact) / 4))


def build_chat_performance_metrics(
    *,
    request_started_at: float,
    completed_at: float,
    first_token_at: Optional[float],
    reported_usage: Optional[UsageSummary],
    estimated_input_text: str,
    estimated_output_text: str,
    model_name: Optional[str],
    provider: Optional[str],
) -> ChatPerformanceMetricsPayload:
    """Build the final transport/persistence payload for chat metrics."""
    total_duration_ms = max(0, round((completed_at - request_started_at) * 1000))
    first_token_latency_ms = None
    completion_duration_ms = None
    if first_token_at is not None:
        first_token_latency_ms = max(0, round((first_token_at - request_started_at) * 1000))
        completion_duration_ms = max(0, round((completed_at - first_token_at) * 1000))

    if reported_usage:
        input_tokens = reported_usage["input_tokens"]
        output_tokens = reported_usage["output_tokens"]
        total_tokens = reported_usage["total_tokens"]
        input_source: TokenSource = "reported"
        output_source: TokenSource = "reported"
        total_source: TokenSource = "reported"
    else:
        input_tokens = estimate_token_count(
            estimated_input_text,
            model_name=model_name,
            provider=provider,
        )
        output_tokens = estimate_token_count(
            estimated_output_text,
            model_name=model_name,
            provider=provider,
        )
        total_tokens = (
            input_tokens + output_tokens
            if input_tokens is not None and output_tokens is not None
            else None
        )
        input_source = "estimated" if input_tokens is not None else "unavailable"
        output_source = "estimated" if output_tokens is not None else "unavailable"
        total_source = "estimated" if total_tokens is not None else "unavailable"

    output_tokens_per_second = None
    if output_tokens is not None and completion_duration_ms and completion_duration_ms > 0:
        output_tokens_per_second = round(output_tokens / (completion_duration_ms / 1000), 2)

    return {
        "first_token_latency_ms": first_token_latency_ms,
        "completion_duration_ms": completion_duration_ms,
        "total_duration_ms": total_duration_ms,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "output_tokens_per_second": output_tokens_per_second,
        "input_token_source": input_source,
        "output_token_source": output_source,
        "total_token_source": total_source,
    }
