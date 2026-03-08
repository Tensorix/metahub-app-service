"""SystemConfig model — key-value store for system-wide configuration."""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.model.base import Base


class SystemConfig(Base):
    """系统配置表 — 以 key-value 形式存储各模块的配置"""

    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(
        String(200),
        primary_key=True,
        comment="配置键，如 message_analyzer, embedding",
    )
    value: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        comment="配置值 (JSONB)",
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="配置描述",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="最后更新时间",
    )
