# Step 2: 数据库 Schema 变更

## 2.1 设计决策

### 方案对比: JSONB 字段 vs 独立表

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Agent 表 JSONB 字段** | 简单，与现有 tools/skills 字段模式一致 | 无法独立查询 MCP Server，无外键约束 |
| **独立 McpServer 表** | 可独立管理，支持共享，可扩展性好 | 增加 JOIN 查询复杂度 |

**选择: 独立 `agent_mcp_server` 表**

理由:
1. MCP Server 配置较复杂（URL、headers、认证信息），不适合全部塞入 JSONB
2. 未来可能需要在多个 Agent 间共享同一个 MCP Server 配置
3. 需要独立记录每个 MCP Server 的连接状态、最后检查时间等运行时信息
4. 与现有 `SubAgent` 独立表的模式保持一致

## 2.2 数据模型设计

### 新增表: `agent_mcp_server`

```python
# app/db/model/agent_mcp_server.py

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
    """Agent MCP Server 配置表"""
    __tablename__ = "agent_mcp_server"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)

    # 关联 Agent
    agent_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属 Agent ID"
    )

    # 基本信息
    name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="MCP Server 显示名称（如: database-tools, weather-api）"
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="MCP Server 描述"
    )

    # 连接配置
    url: Mapped[str] = mapped_column(
        String(500), nullable=False,
        comment="MCP Server URL (如: http://localhost:8000/mcp)"
    )
    headers: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="自定义 HTTP Headers（如 Authorization）"
    )

    # 启用状态
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="是否启用此 MCP Server"
    )

    # 排序
    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="排序权重"
    )

    # 运行时状态（不由用户直接编辑）
    last_connected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="最后成功连接时间"
    )
    last_error: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="最后一次连接错误信息"
    )
    cached_tools: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True,
        comment="缓存的工具列表 [{name, description, input_schema}]"
    )

    # 元数据
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
        Boolean, default=False, nullable=False,
        comment="是否删除"
    )

    # Relationships
    agent: Mapped["Agent"] = relationship(
        "Agent", back_populates="mcp_servers"
    )
```

### Agent 模型更新

```python
# app/db/model/agent.py - 添加 relationship

class Agent(Base):
    # ... 现有字段 ...

    # 新增 relationship
    mcp_servers: Mapped[list["AgentMcpServer"]] = relationship(
        "AgentMcpServer",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin"
    )
```

### Model __init__.py 注册

```python
# app/db/model/__init__.py 中添加:
from app.db.model.agent_mcp_server import AgentMcpServer
```

## 2.3 字段说明

### headers 字段结构

```json
{
  "Authorization": "Bearer sk-xxx",
  "X-API-Key": "key-xxx",
  "X-Custom-Header": "value"
}
```

> **安全注意**: headers 中可能包含敏感信息（API Key、Token），需要:
> 1. API 响应中对 header values 进行脱敏处理
> 2. 日志中不打印 header 内容
> 3. 后续可考虑加密存储

### cached_tools 字段结构

```json
[
  {
    "name": "query_database",
    "description": "Execute SQL queries on the database",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": {"type": "string", "description": "SQL query"}
      },
      "required": ["query"]
    }
  }
]
```

## 2.4 Alembic 迁移

```python
# alembic/versions/xxx_add_agent_mcp_server.py

"""add agent_mcp_server table

Revision ID: xxx
Revises: <previous_revision>
Create Date: 2026-01-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    op.create_table(
        "agent_mcp_server",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("headers", postgresql.JSONB(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("cached_tools", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("timezone('UTC', now())"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("timezone('UTC', now())"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["agent_id"], ["agent.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_mcp_server_agent_id", "agent_mcp_server", ["agent_id"])

def downgrade() -> None:
    op.drop_index("ix_agent_mcp_server_agent_id")
    op.drop_table("agent_mcp_server")
```

## 2.5 Schema 定义

```python
# 在 app/schema/agent.py 或新建 app/schema/mcp_server.py 中添加:

class McpServerBase(BaseModel):
    """MCP Server 配置基础 Schema."""
    name: str = Field(..., min_length=1, max_length=100, description="MCP Server 名称")
    description: Optional[str] = Field(None, description="描述")
    url: str = Field(..., min_length=1, max_length=500, description="MCP Server URL")
    headers: Optional[dict[str, str]] = Field(None, description="自定义 HTTP Headers")
    is_enabled: bool = Field(True, description="是否启用")
    sort_order: int = Field(0, description="排序权重")


class McpServerCreate(McpServerBase):
    """创建 MCP Server 请求."""
    pass


class McpServerUpdate(BaseModel):
    """更新 MCP Server 请求."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    headers: Optional[dict[str, str]] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class McpServerResponse(McpServerBase):
    """MCP Server 响应."""
    id: UUID
    agent_id: UUID
    last_connected_at: Optional[datetime] = None
    last_error: Optional[str] = None
    cached_tools: Optional[list[dict]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("headers", mode="before")
    @classmethod
    def mask_sensitive_headers(cls, v):
        """脱敏处理 header 中的敏感值."""
        if not v:
            return v
        masked = {}
        sensitive_keys = {"authorization", "x-api-key", "api-key", "token"}
        for key, value in v.items():
            if key.lower() in sensitive_keys and len(value) > 8:
                masked[key] = value[:4] + "****" + value[-4:]
            else:
                masked[key] = value
        return masked


class McpServerTestResult(BaseModel):
    """MCP Server 连接测试结果."""
    success: bool
    message: str
    tools: Optional[list[dict]] = None
    latency_ms: Optional[float] = None
```

## 2.6 与 AgentBase Schema 的关系

`AgentResponse` 中将包含 `mcp_servers` 字段:

```python
class AgentResponse(AgentBase):
    # ... 现有字段 ...
    mcp_servers: list[McpServerResponse] = Field(
        default_factory=list, description="MCP Server 配置列表"
    )
```

这样在获取 Agent 详情时，MCP Server 配置会随 Agent 一起返回，
与现有的 `subagents` 字段处理方式一致。
