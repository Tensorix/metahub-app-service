from app.db.model.base import Base
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid7

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.db.model.agent import Agent


class AgentVersion(Base):
    """Agent 配置版本历史表"""
    __tablename__ = "agent_version"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        comment="Agent ID"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="版本号，从 1 开始递增"
    )

    # Snapshot of configuration at this version
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Agent 名称快照"
    )
    system_prompt: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="系统提示词快照"
    )
    model: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, comment="模型名称快照"
    )
    model_provider: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="模型提供商快照"
    )
    temperature: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True, comment="温度参数快照"
    )
    max_tokens: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="最大 token 数快照"
    )
    tools: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="工具列表快照"
    )
    subagents_snapshot: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="SubAgents 配置快照"
    )
    metadata_snapshot: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, comment="扩展元数据快照"
    )

    change_summary: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="变更摘要"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间"
    )

    # Relationships
    agent: Mapped["Agent"] = relationship("Agent", back_populates="versions")

    # Unique constraint: one version number per agent
    __table_args__ = (
        UniqueConstraint("agent_id", "version", name="uq_agent_version"),
    )
