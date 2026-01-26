from app.db.model.base import Base
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.db.model.agent import Agent


class SubAgent(Base):
    """SubAgent 子代理表"""
    __tablename__ = "subagent"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    parent_agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        comment="父 Agent ID"
    )

    name: Mapped[str] = mapped_column(
        String(100), nullable=False, comment="子代理名称"
    )
    description: Mapped[str] = mapped_column(
        Text, nullable=False, comment="子代理描述，用于任务委派时的选择"
    )
    system_prompt: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="子代理系统提示词"
    )
    model: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, comment="子代理使用的模型，为空则继承父 Agent"
    )
    tools: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list, comment="子代理可用工具列表"
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
    parent_agent: Mapped["Agent"] = relationship(
        "Agent", back_populates="subagents"
    )
