"""Embedding service with provider abstraction layer.

Supports multiple embedding providers (OpenAI, HTTP-compatible APIs like Ollama/TEI/vLLM).
Model configuration is managed via the EMBEDDING_MODELS registry in app/config/embedding.py.
"""

import os
from abc import ABC, abstractmethod
from typing import Optional

import httpx
from loguru import logger
from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import config
from app.config.embedding import (
    DEFAULT_EMBEDDING_MODEL,
    EmbeddingModelConfig,
    get_model_config,
)
from app.db.model.embedding_config import EmbeddingConfig


# ============================================================================
# Provider Abstraction Layer
# ============================================================================


class EmbeddingProvider(ABC):
    """Embedding provider abstract base class."""

    MIN_CONTENT_LENGTH = 2  # Skip embedding for text shorter than this

    def __init__(self, config: EmbeddingModelConfig):
        self._config = config

    @abstractmethod
    def generate_single(self, text: str) -> list[float]:
        """Generate embedding for a single text. Input is already filtered/truncated."""
        ...

    @abstractmethod
    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts. Input is already filtered/truncated."""
        ...


class OpenAIProvider(EmbeddingProvider):
    """OpenAI / Azure OpenAI / OpenAI-compatible API provider."""

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)

        # API key: use model-specific env var if specified, else global config
        api_key = (
            os.environ.get(config.api_key_env)
            if config.api_key_env
            else None
        )
        if not api_key:
            from app.config import config as app_config
            api_key = app_config.OPENAI_API_KEY

        # Base URL: use model-specific if specified, else global config
        base_url = config.api_base_url
        if not base_url:
            from app.config import config as app_config
            base_url = app_config.OPENAI_BASE_URL

        self._client = OpenAI(api_key=api_key, base_url=base_url)

    def generate_single(self, text: str) -> list[float]:
        response = self._client.embeddings.create(
            model=self._config.model_name,
            input=text,
            dimensions=self._config.dimensions,
        )
        return response.data[0].embedding

    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        response = self._client.embeddings.create(
            model=self._config.model_name,
            input=texts,
            dimensions=self._config.dimensions,
        )
        # OpenAI returns data sorted by index
        sorted_data = sorted(response.data, key=lambda d: d.index)
        return [d.embedding for d in sorted_data]


class HTTPProvider(EmbeddingProvider):
    """Generic HTTP provider for Ollama / HuggingFace TEI / vLLM / etc.

    Expects OpenAI-compatible /v1/embeddings endpoint:
        POST {api_base_url}/v1/embeddings
        {"model": "...", "input": ["text1", "text2"]}

    Response format:
        {"data": [{"embedding": [...], "index": 0}, ...]}
    """

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        if not config.api_base_url:
            raise ValueError(
                f"HTTPProvider requires api_base_url for model {config.model_id}"
            )
        self._client = httpx.Client(
            base_url=config.api_base_url,
            timeout=60.0,
        )

    def generate_single(self, text: str) -> list[float]:
        return self.generate_batch([text])[0]

    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        response = self._client.post(
            "/v1/embeddings",
            json={"model": self._config.model_name, "input": texts},
        )
        response.raise_for_status()
        data = response.json()["data"]
        sorted_data = sorted(data, key=lambda d: d["index"])
        return [d["embedding"] for d in sorted_data]


# Provider registry
_PROVIDER_MAP = {
    "openai": OpenAIProvider,
    "http": HTTPProvider,
}


def create_provider(config: EmbeddingModelConfig) -> EmbeddingProvider:
    """Factory function to create provider instance from config."""
    cls = _PROVIDER_MAP.get(config.provider)
    if cls is None:
        raise ValueError(
            f"Unknown provider '{config.provider}'. "
            f"Available: {list(_PROVIDER_MAP.keys())}"
        )
    return cls(config)


# ============================================================================
# EmbeddingService (Dispatch Layer)
# ============================================================================


class EmbeddingService:
    """Embedding service dispatch layer.

    Routes requests to the appropriate provider based on model config.
    Handles text filtering, truncation, and batch processing.
    """

    MIN_CONTENT_LENGTH = 2

    def __init__(self, model_config: EmbeddingModelConfig):
        self._config = model_config
        self._provider = create_provider(model_config)

    def generate_embedding(self, text: str) -> Optional[list[float]]:
        """Generate embedding for a single text. Returns None if text is too short."""
        if not text or len(text.strip()) < self.MIN_CONTENT_LENGTH:
            return None

        truncated = text[: self._config.max_tokens * 2]
        try:
            return self._provider.generate_single(truncated)
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    def generate_embeddings_batch(
        self, texts: list[str]
    ) -> list[Optional[list[float]]]:
        """Generate embeddings for a batch of texts. Returns None for texts that are too short."""
        results: list[Optional[list[float]]] = [None] * len(texts)

        valid_indices = []
        valid_texts = []
        for i, text in enumerate(texts):
            if text and len(text.strip()) >= self.MIN_CONTENT_LENGTH:
                valid_indices.append(i)
                valid_texts.append(text[: self._config.max_tokens * 2])

        if not valid_texts:
            return results

        batch_size = self._config.batch_size
        for start in range(0, len(valid_texts), batch_size):
            end = min(start + batch_size, len(valid_texts))
            batch_texts = valid_texts[start:end]
            batch_indices = valid_indices[start:end]
            try:
                embeddings = self._provider.generate_batch(batch_texts)
                for j, emb in enumerate(embeddings):
                    results[batch_indices[j]] = emb
            except Exception as e:
                logger.error(f"Batch embedding failed [{start}:{end}]: {e}")
                continue

        return results

    def generate_query_embedding(self, query: str) -> Optional[list[float]]:
        """Generate embedding for a search query."""
        if not query or len(query.strip()) < 1:
            return None
        try:
            return self._provider.generate_single(query.strip())
        except Exception as e:
            logger.error(f"Query embedding failed: {e}")
            raise


# ============================================================================
# Helper Functions
# ============================================================================


def get_active_embedding_service(
    db: Session, category: str = "message"
) -> tuple[EmbeddingService, EmbeddingModelConfig]:
    """Get the active embedding service for a category.

    Priority:
      1. system_config table (key="embedding") — supports arbitrary models
      2. embedding_config table — legacy registry-based selection
      3. DEFAULT_EMBEDDING_MODEL from registry

    Args:
        db: Database session
        category: Business category (e.g. "message", "document")

    Returns:
        (EmbeddingService, EmbeddingModelConfig) tuple
    """
    # Priority 1: system_config table
    try:
        from app.service.system_config import get_embedding_config, resolve_provider
        sc = get_embedding_config(db)
        if sc and sc.model_name:
            api_base_url, _api_key, _sdk = resolve_provider(db, sc.provider)
            model_config = EmbeddingModelConfig(
                model_id=f"sys-{sc.provider}-{sc.model_name}",
                provider=sc.provider,
                model_name=sc.model_name,
                dimensions=sc.dimensions,
                max_tokens=sc.max_tokens,
                batch_size=sc.batch_size,
                api_base_url=api_base_url,
            )
            return EmbeddingService(model_config), model_config
    except Exception as e:
        logger.warning(f"Failed to load embedding config from system_config: {e}")

    # Priority 2: embedding_config table (legacy)
    row = (
        db.query(EmbeddingConfig)
        .filter(EmbeddingConfig.category == category)
        .first()
    )
    model_id = row.model_id if row else DEFAULT_EMBEDDING_MODEL
    model_config = get_model_config(model_id)
    return EmbeddingService(model_config), model_config


def get_embedding_service_by_model(
    model_id: str,
) -> tuple[EmbeddingService, EmbeddingModelConfig]:
    """Get embedding service for a specific model_id."""
    model_config = get_model_config(model_id)
    return EmbeddingService(model_config), model_config
