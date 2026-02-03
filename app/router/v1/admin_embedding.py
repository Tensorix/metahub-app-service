# app/router/v1/admin_embedding.py

"""Admin API for embedding model management."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.model.embedding_config import EmbeddingConfig
from app.db.model.message_embedding import MessageEmbedding
from app.db.model.message_search_index import MessageSearchIndex
from app.db.session import get_db
from app.deps import get_current_user  # , get_current_active_superuser
from app.config.embedding import EMBEDDING_MODELS, get_model_config

router = APIRouter(prefix="/admin/embedding", tags=["admin-embedding"])


class SwitchRequest(BaseModel):
    category: str
    model_id: str


@router.post("/switch")
def switch_model(
    req: SwitchRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
    # _user=Depends(get_current_active_superuser),  # TODO: Enable superuser check in production
):
    """
    Switch the active embedding model for a category.

    This updates the embedding_config table. A background task should
    be triggered to re-embed all existing records with the new model.

    Args:
        req: Switch request with category and model_id

    Returns:
        Status message
    """
    if req.model_id not in EMBEDDING_MODELS:
        raise HTTPException(
            400,
            f"Unknown model: {req.model_id}. "
            f"Available: {list(EMBEDDING_MODELS.keys())}",
        )

    # Update or insert embedding_config
    cfg = (
        db.query(EmbeddingConfig)
        .filter(EmbeddingConfig.category == req.category)
        .first()
    )
    if cfg:
        cfg.model_id = req.model_id
    else:
        cfg = EmbeddingConfig(category=req.category, model_id=req.model_id)
        db.add(cfg)
    db.commit()

    # TODO: Trigger background re-embed task
    # For now, admin should manually run backfill script with --regenerate-embeddings

    return {
        "status": "switched",
        "category": req.category,
        "model_id": req.model_id,
        "note": "Run backfill script with --regenerate-embeddings to re-embed existing data",
    }


@router.get("/status")
def get_status(
    category: str = "message",
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
    # _user=Depends(get_current_active_superuser),  # TODO: Enable superuser check in production
):
    """
    Get embedding status for a category.

    Returns:
        Status information including active model and coverage
    """
    cfg = (
        db.query(EmbeddingConfig)
        .filter(EmbeddingConfig.category == category)
        .first()
    )
    model_id = cfg.model_id if cfg else "openai-3-large"
    model_config = get_model_config(model_id)

    total_indices = (
        db.query(func.count()).select_from(MessageSearchIndex).scalar()
    )

    total_embeddings = (
        db.query(func.count())
        .select_from(MessageEmbedding)
        .filter(
            MessageEmbedding.model_id == model_id,
            MessageEmbedding.status == "completed",
        )
        .scalar()
    )

    return {
        "category": category,
        "active_model": model_id,
        "model_dimensions": model_config.dimensions,
        "model_provider": model_config.provider,
        "total_indices": total_indices,
        "completed_embeddings": total_embeddings,
        "coverage": (
            f"{total_embeddings / total_indices * 100:.1f}%"
            if total_indices > 0
            else "N/A"
        ),
    }


@router.get("/models")
def list_models(
    _user=Depends(get_current_user),
    # _user=Depends(get_current_active_superuser),  # TODO: Enable superuser check in production
):
    """
    List all registered embedding models.

    Returns:
        List of model configurations
    """
    return {
        "models": [
            {
                "model_id": cfg.model_id,
                "provider": cfg.provider,
                "model_name": cfg.model_name,
                "dimensions": cfg.dimensions,
                "index_slug": cfg.index_slug,
            }
            for cfg in EMBEDDING_MODELS.values()
        ]
    }
