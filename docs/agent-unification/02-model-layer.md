# Step 2: ORM Model 层改造

## 概述

改造 SQLAlchemy ORM 模型：修改 `Agent` 模型新增字段和关系，新建 `AgentSubagent` 关联模型，最终废弃 `SubAgent` 模型。

## 2.1 新建 `AgentSubagent` 关联模型

**新建文件**：`app/db/model/agent_subagent.py`

```python
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
```

## 2.2 修改 `Agent` 模型

**修改文件**：`app/db/model/agent.py`

### 变更内容

```diff
+ from app.db.model.agent_subagent import AgentSubagent  # (TYPE_CHECKING 中)

  class Agent(Base):
      __tablename__ = "agent"

      id: ...
      name: ...
+     description: Mapped[Optional[str]] = mapped_column(
+         Text, nullable=True, comment="通用能力描述"
+     )
      system_prompt: ...
      # ... 其余字段不变 ...

      # Relationships
      sessions: ...
-     subagents: Mapped[list["SubAgent"]] = relationship(
-         "SubAgent",
-         back_populates="parent_agent",
-         cascade="all, delete-orphan",
-         lazy="selectin"
-     )
+     # 新关系：我挂载了哪些 SubAgent
+     mounted_subagents: Mapped[list["AgentSubagent"]] = relationship(
+         "AgentSubagent",
+         foreign_keys="AgentSubagent.parent_agent_id",
+         back_populates="parent_agent",
+         cascade="all, delete-orphan",
+         lazy="selectin",
+         order_by="AgentSubagent.sort_order",
+     )
+     # 反向关系：我被哪些 Agent 挂载为 SubAgent
+     mounted_as_subagent_in: Mapped[list["AgentSubagent"]] = relationship(
+         "AgentSubagent",
+         foreign_keys="AgentSubagent.child_agent_id",
+         back_populates="child_agent",
+         lazy="noload",  # 按需加载，避免 N+1
+     )
      versions: ...
      mcp_servers: ...
```

### 关系设计说明

| 关系名 | 方向 | 加载策略 | 说明 |
|--------|------|---------|------|
| `mounted_subagents` | 正向（父 → 子） | `selectin`（即时加载） | 获取 Agent 时自动加载其 SubAgent 列表 |
| `mounted_as_subagent_in` | 反向（子 → 父） | `noload`（按需加载） | 仅在需要时查询"此 Agent 被哪些父 Agent 使用" |

## 2.3 更新 `__init__.py` 导出

**修改文件**：`app/db/model/__init__.py`

```diff
  from app.db.model.agent import Agent
+ from app.db.model.agent_subagent import AgentSubagent
  from app.db.model.agent_version import AgentVersion
  from app.db.model.agent_mcp_server import AgentMcpServer
- from app.db.model.subagent import SubAgent
  # ... 其余导出不变
```

## 2.4 废弃 `SubAgent` 模型

**废弃文件**：`app/db/model/subagent.py`

迁移过渡期保留文件但添加废弃标记：

```python
"""
DEPRECATED: SubAgent 已统一到 Agent 表。
请使用 AgentSubagent 关联表代替。
此文件将在数据迁移完成后删除。
"""

import warnings
warnings.warn(
    "SubAgent model is deprecated. Use Agent + AgentSubagent instead.",
    DeprecationWarning,
    stacklevel=2,
)

# ... 保留原有代码用于数据迁移读取 ...
```

## 2.5 关系图

```
Agent (id=A1, name="主协调者")
  │
  ├── mounted_subagents[0] ── AgentSubagent (parent=A1, child=A2, description="搜索任务委派")
  │                                └── child_agent ── Agent (id=A2, name="搜索专家")
  │                                                      ├── mcp_servers: [Google Search MCP]
  │                                                      └── tools: ["web_search"]
  │
  └── mounted_subagents[1] ── AgentSubagent (parent=A1, child=A3, description="代码审查")
                                   └── child_agent ── Agent (id=A3, name="代码审查专家")
                                                         ├── mcp_servers: [GitHub MCP]
                                                         ├── tools: ["read_file", "grep"]
                                                         └── mounted_subagents: [...]  ← A3 也可以有自己的 SubAgent!
```

> **关键优势**：SubAgent（A2, A3）本身也是完整的 Agent，拥有自己的 MCP Servers、Skills、Memory、甚至自己的 SubAgent（支持多层级嵌套）。
