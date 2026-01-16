from app.db.model.base import Base
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Agent(Base):
    """Agent 表"""
    __tablename__ = "agent"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="Agent 名称")
    system_prompt: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="系统提示词"
    )
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True, comment="扩展元数据"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
        comment="更新时间"
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否删除"
    )

    # Relationships
    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="agent")
