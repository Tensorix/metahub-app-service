"""EmbeddingConfig model — persists the active embedding model per category."""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model.base import Base


class EmbeddingConfig(Base):
    """活跃模型配置表 — 每个业务类别对应一条记录"""

    __tablename__ = "embedding_config"

    category: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        comment="业务类别: message, document 等",
    )
    model_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="EMBEDDING_MODELS 注册表中的 key",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="最后更新时间",
    )
