# Step 1: 数据库 Schema 变更

## 概述

本步骤定义所有数据库结构变更，包括 `agent` 表新增字段、新建 `agent_subagent` 关联表。

## 1.1 agent 表变更

### 新增字段

```sql
ALTER TABLE agent ADD COLUMN description TEXT NULL COMMENT '通用能力描述，用于被挂载为 SubAgent 时的任务匹配';
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `description` | `TEXT` | `NULLABLE` | Agent 的通用能力描述。当此 Agent 被挂载为 SubAgent 时，父 Agent 据此决定是否委派任务 |

> **设计决策**：不新增 `is_subagent_capable` 标志字段。任何 Agent 都可以被挂载为 SubAgent，无需预先标记。查询"可作为 SubAgent 的 Agent 列表"时直接返回全部 Agent（排除自身和祖先，防止循环引用）。

## 1.2 新建 agent_subagent 关联表

```sql
CREATE TABLE agent_subagent (
    id UUID PRIMARY KEY DEFAULT uuid7(),

    -- 父子关系
    parent_agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    child_agent_id  UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,

    -- 挂载上下文
    mount_description TEXT NULL,   -- 在父 Agent 上下文中的角色描述 (覆盖 child 的 description)
    sort_order INTEGER NOT NULL DEFAULT 0, -- 排序序号

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 约束
    CONSTRAINT uq_agent_subagent UNIQUE (parent_agent_id, child_agent_id),
    CONSTRAINT ck_no_self_mount CHECK (parent_agent_id != child_agent_id)
);

CREATE INDEX ix_agent_subagent_parent ON agent_subagent(parent_agent_id);
CREATE INDEX ix_agent_subagent_child  ON agent_subagent(child_agent_id);
```

### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `UUID` | PK | uuid7 主键 |
| `parent_agent_id` | `UUID` | FK → agent.id, CASCADE | 父 Agent |
| `child_agent_id` | `UUID` | FK → agent.id, CASCADE | 被挂载的子 Agent |
| `mount_description` | `TEXT` | NULLABLE | 挂载时的角色描述，覆盖 `child.description`。例如同一个"搜索 Agent"在不同父 Agent 中扮演不同角色 |
| `sort_order` | `INTEGER` | NOT NULL, DEFAULT 0 | 在父 Agent 的 SubAgent 列表中的排序位置 |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | 挂载时间 |

### 设计决策

1. **无 `is_deleted` 软删除**：卸载 SubAgent 即物理删除关联记录，语义更清晰
2. **无 `updated_at`**：关联记录的修改仅限于 `mount_description` 和 `sort_order`，轻量操作不需要追踪
3. **CASCADE 双向**：父 Agent 或子 Agent 被删除时自动清理关联记录
4. **CHECK 约束**：数据库层面禁止自己挂载自己
5. **UNIQUE 约束**：同一个 Agent 在同一个父 Agent 下只能挂载一次

## 1.3 Alembic 迁移脚本骨架

```python
"""unify agent and subagent

Revision ID: xxxxxxxxxxxx
Revises: <current_head>
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'xxxxxxxxxxxx'
down_revision = '<current_head>'


def upgrade():
    # 1. agent 表新增 description 字段
    op.add_column('agent', sa.Column('description', sa.Text(), nullable=True,
                  comment='通用能力描述'))

    # 2. 创建 agent_subagent 关联表
    op.create_table(
        'agent_subagent',
        sa.Column('id', UUID(), primary_key=True),
        sa.Column('parent_agent_id', UUID(), sa.ForeignKey('agent.id', ondelete='CASCADE'), nullable=False),
        sa.Column('child_agent_id', UUID(), sa.ForeignKey('agent.id', ondelete='CASCADE'), nullable=False),
        sa.Column('mount_description', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('parent_agent_id', 'child_agent_id', name='uq_agent_subagent'),
        sa.CheckConstraint('parent_agent_id != child_agent_id', name='ck_no_self_mount'),
    )
    op.create_index('ix_agent_subagent_parent', 'agent_subagent', ['parent_agent_id'])
    op.create_index('ix_agent_subagent_child', 'agent_subagent', ['child_agent_id'])

    # 3. 数据迁移：将 subagent 表记录转换为 agent + agent_subagent
    #    (详见 Step 8: 08-data-migration.md)

    # 4. 暂不删除 subagent 表，等数据迁移验证通过后再删除


def downgrade():
    op.drop_index('ix_agent_subagent_child', 'agent_subagent')
    op.drop_index('ix_agent_subagent_parent', 'agent_subagent')
    op.drop_table('agent_subagent')
    op.drop_column('agent', 'description')
```

## 1.4 关于循环引用

数据库层面只做了 `CHECK (parent_agent_id != child_agent_id)` 防止自引用。更深层的循环引用（A→B→C→A）在应用层 Service 中检测（详见 Step 4）。

理由：PostgreSQL 的 CHECK 约束不支持递归查询，用触发器实现过于复杂。应用层检测足够且更灵活。
