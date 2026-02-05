"""Agent MCP Server 配置模型."""

from app.db.model.base import Base
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid7

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    ForeignKey,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.db.model.agent import Agent


class AgentMcpServer(Base):
    """Agent MCP Server 配置表."""

    __tablename__ = "agent_mcp_server"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)

    # 关联 Agent
    agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属 Agent ID",
    )

    # 基本信息
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="MCP Server 显示名称（如: database-tools, weather-api）",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="MCP Server 描述"
    )

    # 连接配置
    transport: Mapped[str] = mapped_column(
        String(50), nullable=False, default="http",
        comment="传输协议类型 (http/streamable-http, sse, stdio)"
    )
    url: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="MCP Server URL (如: http://localhost:8000/mcp)"
    )
    headers: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, comment="自定义 HTTP Headers（如 Authorization）"
    )

    # 启用状态
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="是否启用此 MCP Server"
    )

    # 排序
    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="排序权重"
    )

    # 运行时状态（不由用户直接编辑）
    last_connected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="最后成功连接时间"
    )
    last_error: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="最后一次连接错误信息"
    )
    cached_tools: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="缓存的工具列表 [{name, description, input_schema}]"
    )

    # 元数据
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
        comment="更新时间",
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否删除"
    )

    # Relationships
    agent: Mapped["Agent"] = relationship("Agent", back_populates="mcp_servers")
