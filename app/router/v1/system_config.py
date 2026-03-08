"""API endpoints for SystemConfig management."""

import copy

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.schema.system_config import (
    FetchModelsRequest,
    FetchModelsResponse,
    SystemConfigResponse,
    SystemConfigUpdate,
)
from app.service import system_config as svc

router = APIRouter(prefix="/system-config", tags=["system-config"])


@router.get("/{key}", response_model=SystemConfigResponse)
def get_system_config(
    key: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a system config by key. Masks api_key for providers."""
    row = svc.get_config(db, key)
    if not row:
        raise HTTPException(404, f"Config key '{key}' not found")

    if key == "providers":
        row = _mask_provider_keys(row)

    return row


@router.put("/{key}", response_model=SystemConfigResponse)
def update_system_config(
    key: str,
    body: SystemConfigUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Upsert a system config. Triggers side-effects for known keys."""
    row = svc.upsert_config(db, key, body.value, body.description)

    # Side-effects for specific keys
    if key == "message_analyzer":
        from app.agent.message_analyzer import reset_message_analyzer
        reset_message_analyzer()

    if key == "embedding":
        _sync_embedding_config(db, body.value)

    if key == "providers":
        # Provider change may affect agent / analyzer connections
        from app.agent.factory import AgentFactory
        from app.agent.message_analyzer import reset_message_analyzer
        AgentFactory.clear_cache()
        reset_message_analyzer()

    if key == "agent_default":
        from app.agent.factory import AgentFactory
        AgentFactory.clear_cache()

    db.commit()
    db.refresh(row)

    if key == "providers":
        row = _mask_provider_keys(row)

    return row


@router.post("/proxy/models", response_model=FetchModelsResponse)
async def proxy_fetch_models(
    body: FetchModelsRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Proxy request to upstream /models endpoint.

    Supports:
      - provider_id: resolve base_url/api_key from registry
      - base_url + api_key: direct (for testing before saving)
    """
    base_url = body.base_url
    api_key = body.api_key

    if body.provider_id:
        resolved_url, resolved_key = svc.resolve_provider(db, body.provider_id)
        base_url = base_url or resolved_url
        api_key = api_key or resolved_key

    if not base_url:
        raise HTTPException(400, "Must provide provider_id or base_url")

    try:
        models = await svc.fetch_upstream_models(base_url, api_key)
        return FetchModelsResponse(models=models)
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch models: {e}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mask_provider_keys(row) -> object:
    """Return a copy of the row with api_key values masked (last 4 chars only)."""
    masked_value = copy.deepcopy(row.value)
    for _pid, prov in masked_value.items():
        if isinstance(prov, dict):
            raw_key = prov.get("api_key")
            if raw_key and isinstance(raw_key, str) and len(raw_key) > 4:
                prov["api_key"] = "****" + raw_key[-4:]

    # Return a simple namespace that matches SystemConfigResponse fields
    class _Masked:
        pass

    m = _Masked()
    m.key = row.key
    m.value = masked_value
    m.description = row.description
    m.updated_at = row.updated_at
    return m


def _sync_embedding_config(db: Session, value: dict) -> None:
    """Sync embedding system_config to embedding_config table for backward compat."""
    from app.db.model.embedding_config import EmbeddingConfig
    from app.config.embedding import EMBEDDING_MODELS

    model_name = value.get("model_name", "")

    # Try to find a matching model_id in the registry by model_name
    model_id = None
    for mid, cfg in EMBEDDING_MODELS.items():
        if cfg.model_name == model_name:
            model_id = mid
            break

    if not model_id:
        return  # No matching registered model — skip sync

    row = db.query(EmbeddingConfig).filter(EmbeddingConfig.category == "message").first()
    if row:
        row.model_id = model_id
    else:
        db.add(EmbeddingConfig(category="message", model_id=model_id))
    db.flush()
