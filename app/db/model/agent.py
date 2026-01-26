from app.db.model.base import Base
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.db.model.session import Session
    from app.db.model.subagent import SubAgent
    from app.db.model.agent_version import AgentVersion


class Agent(Base):
    """Agent 表"""
    __tablename__ = "agent"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="Agent 名称")
    system_prompt: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="系统提示词"
    )

    # DeepAgents configuration columns
    model: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, default="gpt-4o-mini", comment="模型名称"
    )
    model_provider: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, default="openai", comment="模型提供商"
    )
    temperature: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True, default=0.7, comment="温度参数"
    )
    max_tokens: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=4096, comment="最大 token 数"
    )
    tools: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list, comment="工具列表"
    )
    skills: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="技能目录路径列表"
    )
    memory_files: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="记忆文件路径列表"
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
    subagents: Mapped[list["SubAgent"]] = relationship(
        "SubAgent",
        back_populates="parent_agent",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
    versions: Mapped[list["AgentVersion"]] = relationship(
        "AgentVersion",
        back_populates="agent",
        cascade="all, delete-orphan",
        order_by="AgentVersion.version.desc()"
    )
