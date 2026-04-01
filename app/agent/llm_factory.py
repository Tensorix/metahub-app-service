"""Provider-specific LangChain chat model factory."""

from __future__ import annotations

from typing import Any, Optional

from app.config import config


SUPPORTED_PROVIDER_TYPES = {"openai", "openrouter"}


def build_chat_model(
    *,
    provider_type: str,
    model: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
):
    """Build a concrete LangChain chat model for the given provider type."""
    kwargs: dict[str, Any] = {"model": model}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    if temperature is not None:
        kwargs["temperature"] = float(temperature)
    if max_tokens is not None:
        kwargs["max_tokens"] = int(max_tokens)

    if provider_type == "openai":
        from langchain_openai import ChatOpenAI

        kwargs.setdefault("api_key", config.OPENAI_API_KEY)
        kwargs.setdefault("base_url", config.OPENAI_BASE_URL)
        return ChatOpenAI(**kwargs)

    if provider_type == "openrouter":
        from langchain_openrouter import ChatOpenRouter

        kwargs.pop("max_tokens", None)
        return ChatOpenRouter(**kwargs)

    raise ValueError(
        f"Unsupported provider_type '{provider_type}'. "
        f"Available: {sorted(SUPPORTED_PROVIDER_TYPES)}"
    )
