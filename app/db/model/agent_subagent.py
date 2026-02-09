"""Agent-SubAgent 挂载关联表"""

from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid7

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base

if TYPE_CHECKING:
    from app.db.model.agent import Agent


class AgentSubagent(Base):
    """Agent 子代理挂载关联表。

    将一个 Agent 挂载为另一个 Agent 的 SubAgent。
    同一个 Agent 可被多个父 Agent 挂载（多对多自引用）。
    """

    __tablename__ = "agent_subagent"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)

    parent_agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        comment="父 Agent ID",
    )
    child_agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        comment="子 Agent ID (被挂载的 Agent)",
    )

    mount_description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="在父 Agent 上下文中的角色描述，覆盖子 Agent 的通用 description",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="在父 Agent 的 SubAgent 列表中的排序位置",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="挂载时间",
    )

    # Relationships
    parent_agent: Mapped["Agent"] = relationship(
        "Agent",
        foreign_keys=[parent_agent_id],
        back_populates="mounted_subagents",
    )
    child_agent: Mapped["Agent"] = relationship(
        "Agent",
        foreign_keys=[child_agent_id],
        back_populates="mounted_as_subagent_in",
    )

    __table_args__ = (
        UniqueConstraint(
            "parent_agent_id", "child_agent_id", name="uq_agent_subagent"
        ),
        CheckConstraint(
            "parent_agent_id != child_agent_id", name="ck_no_self_mount"
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<AgentSubagent parent={self.parent_agent_id} "
            f"child={self.child_agent_id}>"
        )
