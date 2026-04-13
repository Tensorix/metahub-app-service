"""Service layer for SystemConfig CRUD and upstream model proxy."""

from typing import Any, Optional

import httpx
from loguru import logger
from sqlalchemy.orm import Session

from app.config import config
from app.db.model.system_config import SystemConfig
from app.schema.system_config import (
    AgentDefaultConfigValue,
    EmbeddingConfigValue,
    MessageAnalyzerConfigValue,
    ProviderConfig,
    SandboxConfigValue,
    UpstreamModel,
)

AUTH_CONFIG_KEY = "auth"


def normalize_auth_config(incoming: dict[str, Any]) -> dict[str, Any]:
    """Persist only known auth-related flags."""
    return {"registration_disabled": bool(incoming.get("registration_disabled", False))}


def get_auth_config_value(db: Session) -> dict[str, Any]:
    """Return auth system config with defaults when missing."""
    row = get_config(db, AUTH_CONFIG_KEY)
    if not row or not row.value or not isinstance(row.value, dict):
        return {"registration_disabled": False}
    return normalize_auth_config(row.value)


def is_registration_disabled(db: Session) -> bool:
    return bool(get_auth_config_value(db).get("registration_disabled"))


def get_config(db: Session, key: str) -> Optional[SystemConfig]:
    """Get a system config row by key."""
    return db.query(SystemConfig).filter(SystemConfig.key == key).first()


def upsert_config(
    db: Session,
    key: str,
    value: dict,
    description: Optional[str] = None,
) -> SystemConfig:
    """Insert or update a system config row."""
    row = get_config(db, key)
    if row:
        row.value = value
        if description is not None:
            row.description = description
    else:
        row = SystemConfig(key=key, value=value, description=description)
        db.add(row)
    db.flush()
    return row


def normalize_provider_registry(
    incoming: dict[str, Any],
    existing: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Normalize provider registry payload before persistence.

    Preserve existing API keys when the client sends a masked value or null.
    """
    normalized: dict[str, Any] = {}
    existing = existing or {}

    for provider_id, raw_config in incoming.items():
        if not isinstance(raw_config, dict):
            normalized[provider_id] = raw_config
            continue

        current = dict(raw_config)
        previous = existing.get(provider_id)
        previous_key = previous.get("api_key") if isinstance(previous, dict) else None
        incoming_key = current.get("api_key")

        if incoming_key is None or (
            isinstance(incoming_key, str)
            and incoming_key.startswith("****")
        ):
            current["api_key"] = previous_key

        normalized[provider_id] = current

    return normalized


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

_DEFAULT_PROVIDERS: dict[str, dict] = {
    "openai": {
        "name": "OpenAI",
        "api_base_url": "https://api.openai.com/v1",
        "api_key": None,
        "provider_type": "openai",
    }
}


def get_providers(db: Session) -> dict[str, ProviderConfig]:
    """Read system_config['providers'], defaults to OpenAI entry."""
    row = get_config(db, "providers")
    if row and row.value:
        try:
            return {k: ProviderConfig(**v) for k, v in row.value.items()}
        except Exception:
            logger.warning("Invalid providers config in DB, using defaults")
    return {k: ProviderConfig(**v) for k, v in _DEFAULT_PROVIDERS.items()}


def resolve_provider(db: Session, provider_id: str) -> tuple[str, str, str]:
    """Resolve (api_base_url, api_key, provider_type) for a provider_id.

    Reads exclusively from the provider registry in DB.
    Returns ("", "", "") if the provider_id is not registered.
    ``provider_type`` is the LangChain-compatible provider type
    (e.g. "openai", "openrouter").
    """
    providers = get_providers(db)
    prov = providers.get(provider_id)

    if prov:
        return prov.api_base_url, prov.api_key or "", prov.provider_type

    return "", "", ""


# ---------------------------------------------------------------------------
# Typed config readers
# ---------------------------------------------------------------------------


def get_message_analyzer_config(db: Optional[Session] = None) -> MessageAnalyzerConfigValue:
    """Get message analyzer config from DB, falling back to defaults."""
    if db is not None:
        row = get_config(db, "message_analyzer")
        if row and row.value:
            try:
                return MessageAnalyzerConfigValue(**row.value)
            except Exception:
                logger.warning("Invalid message_analyzer config in DB, using defaults")

    return MessageAnalyzerConfigValue()


def get_embedding_config(db: Optional[Session] = None) -> EmbeddingConfigValue:
    """Get embedding config from DB, falling back to defaults."""
    if db is not None:
        row = get_config(db, "embedding")
        if row and row.value:
            try:
                return EmbeddingConfigValue(**row.value)
            except Exception:
                logger.warning("Invalid embedding config in DB, using defaults")

    return EmbeddingConfigValue()


def get_agent_default_config(db: Optional[Session] = None) -> AgentDefaultConfigValue:
    """Get agent default config from DB, falling back to env defaults."""
    if db is not None:
        row = get_config(db, "agent_default")
        if row and row.value:
            try:
                return AgentDefaultConfigValue(**row.value)
            except Exception:
                logger.warning("Invalid agent_default config in DB, using defaults")

    return AgentDefaultConfigValue(
        provider=config.AGENT_DEFAULT_PROVIDER,
        model_name=config.AGENT_DEFAULT_MODEL,
    )


def get_sandbox_config(db: Optional[Session] = None) -> SandboxConfigValue:
    """Get sandbox config from DB, falling back to defaults."""
    if db is not None:
        row = get_config(db, "sandbox")
        if row and row.value:
            try:
                return SandboxConfigValue(**row.value)
            except Exception:
                logger.warning("Invalid sandbox config in DB, using defaults")

    return SandboxConfigValue()


def normalize_sandbox_config(
    incoming: dict,
    existing: Optional[dict] = None,
) -> dict:
    """Preserve existing API key when the client sends a masked value or null."""
    result = dict(incoming)
    existing = existing or {}
    previous_key = existing.get("api_key")
    incoming_key = result.get("api_key")

    if incoming_key is None or (
        isinstance(incoming_key, str) and incoming_key.startswith("****")
    ):
        result["api_key"] = previous_key

    return result


# ---------------------------------------------------------------------------
# Upstream model proxy
# ---------------------------------------------------------------------------


async def fetch_upstream_models(
    base_url: str,
    api_key: Optional[str] = None,
    provider_type: str = "openai",
) -> list[UpstreamModel]:
    """Fetch model list from an OpenAI-compatible /models endpoint."""
    url = f"{base_url.rstrip('/')}/models"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    elif provider_type == "openai" and config.OPENAI_API_KEY:
        headers["Authorization"] = f"Bearer {config.OPENAI_API_KEY}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    raw_models = data.get("data", [])
    models = []
    for m in raw_models:
        models.append(
            UpstreamModel(
                id=m.get("id", ""),
                object=m.get("object"),
                owned_by=m.get("owned_by"),
            )
        )
    # Sort by id for stable output
    models.sort(key=lambda x: x.id)
    return models
