"""Embedding model registry and configuration.

Defines available embedding models and their properties.
Adding a new model requires:
  1. Register config here
  2. Create Alembic migration for HNSW partial index
  3. Deploy migration
  4. Switch via admin API
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingModelConfig:
    """Configuration for a single embedding model."""

    model_id: str  # Registry key, e.g. "openai-3-large"
    provider: str  # "openai" | "http"
    model_name: str  # Model name passed to provider API
    dimensions: int  # Output vector dimensions
    max_tokens: int = 8191
    batch_size: int = 100
    api_base_url: str | None = None
    api_key_env: str | None = None  # Env var name for API key override

    @property
    def index_cast(self) -> str:
        """Cast expression for HNSW index and queries. Unified halfvec."""
        return f"halfvec({self.dimensions})"

    @property
    def cosine_ops(self) -> str:
        """Operator class for cosine distance on halfvec."""
        return "halfvec_cosine_ops"

    @property
    def index_slug(self) -> str:
        """Sanitized model_id for use in index names."""
        return self.model_id.replace("-", "_").replace(".", "_")


# ---------------------------------------------------------------------------
# Model registry — add new models here, then create an Alembic migration
# for the corresponding HNSW partial index.
# ---------------------------------------------------------------------------

EMBEDDING_MODELS: dict[str, EmbeddingModelConfig] = {
    "openai-3-large": EmbeddingModelConfig(
        model_id="openai-3-large",
        provider="openai",
        model_name="text-embedding-3-large",
        dimensions=3072,
    ),
    "openai-3-small": EmbeddingModelConfig(
        model_id="openai-3-small",
        provider="openai",
        model_name="text-embedding-3-small",
        dimensions=1536,
    ),
    "bge-m3": EmbeddingModelConfig(
        model_id="bge-m3",
        provider="http",
        model_name="BAAI/bge-m3",
        dimensions=1024,
        api_base_url="http://localhost:8080",
    ),
}

# Default model used when no embedding_config row exists for a category
DEFAULT_EMBEDDING_MODEL = "openai-3-large"


def get_model_config(model_id: str) -> EmbeddingModelConfig:
    """Get model config by model_id. Raises KeyError if not registered."""
    if model_id not in EMBEDDING_MODELS:
        raise KeyError(
            f"Unknown embedding model '{model_id}'. "
            f"Registered models: {list(EMBEDDING_MODELS.keys())}"
        )
    return EMBEDDING_MODELS[model_id]
