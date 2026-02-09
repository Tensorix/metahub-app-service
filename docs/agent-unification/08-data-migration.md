# Step 8: 历史数据迁移脚本

## 概述

将 `subagent` 表中的现有数据迁移到统一的 `agent` + `agent_subagent` 结构。

## 8.1 迁移策略

```
subagent 表记录            →    agent 表 (新 Agent 记录)
                                +
                                agent_subagent 表 (关联记录)
```

### 迁移规则

| subagent 字段 | 映射到 | 说明 |
|--------------|--------|------|
| `name` | `agent.name` | 直接映射 |
| `description` | `agent.description` | 作为通用描述 |
| `system_prompt` | `agent.system_prompt` | 直接映射 |
| `model` | `agent.model` | 直接映射 |
| `tools` | `agent.tools` | 直接映射 |
| `parent_agent_id` | `agent_subagent.parent_agent_id` | 关联到父 Agent |
| `id` (subagent) | `agent_subagent.child_agent_id` → 新 agent.id | 新 Agent 的 ID |
| `created_at` | `agent.created_at` | 保留原始时间 |
| — | `agent.model_provider` | 默认 NULL（继承运行时默认值） |
| — | `agent.temperature` | 默认 NULL |
| — | `agent.max_tokens` | 默认 NULL |

### 去重策略

同一个 SubAgent 配置（相同 name + system_prompt）如果出现在多个父 Agent 中，有两种策略：

- **策略 A：每个 SubAgent 独立创建一个 Agent**（推荐，简单安全）
  - 优点：无数据冲突风险，每个父 Agent 的 SubAgent 配置完全独立
  - 缺点：不利用复用能力（但这与迁移前的行为一致）
  
- **策略 B：相同配置的 SubAgent 合并为一个 Agent**
  - 优点：立即获得复用能力
  - 缺点：需要定义"相同"的判定规则，合并后修改会影响多个父级

**推荐策略 A**：迁移的目标是无损转换，而非优化数据。用户可以在迁移后手动合并重复的 Agent。

## 8.2 迁移脚本

```python
"""
数据迁移：将 subagent 表数据迁移到 agent + agent_subagent。

在 Alembic upgrade() 中调用此函数。
"""

from uuid import uuid7
from sqlalchemy import text


def migrate_subagents_to_agents(op):
    """将 subagent 表中的记录转换为 agent + agent_subagent。"""

    conn = op.get_bind()

    # 1. 读取所有未删除的 SubAgent 记录
    subagents = conn.execute(text("""
        SELECT id, parent_agent_id, name, description, 
               system_prompt, model, tools,
               created_at, updated_at
        FROM subagent
        WHERE is_deleted = false
    """)).fetchall()

    if not subagents:
        print("No subagent records to migrate.")
        return

    print(f"Migrating {len(subagents)} subagent records...")

    for idx, sa in enumerate(subagents):
        new_agent_id = uuid7()

        # 2. 为每个 SubAgent 创建对应的 Agent 记录
        conn.execute(text("""
            INSERT INTO agent (
                id, name, description, system_prompt, model,
                tools, created_at, updated_at, is_deleted
            ) VALUES (
                :id, :name, :description, :system_prompt, :model,
                :tools, :created_at, :updated_at, false
            )
        """), {
            "id": str(new_agent_id),
            "name": sa.name,
            "description": sa.description,
            "system_prompt": sa.system_prompt,
            "model": sa.model,
            "tools": sa.tools,  # JSONB 直接传递
            "created_at": sa.created_at,
            "updated_at": sa.updated_at,
        })

        # 3. 创建 agent_subagent 关联记录
        mount_id = uuid7()
        conn.execute(text("""
            INSERT INTO agent_subagent (
                id, parent_agent_id, child_agent_id,
                mount_description, sort_order, created_at
            ) VALUES (
                :id, :parent_agent_id, :child_agent_id,
                :mount_description, :sort_order, :created_at
            )
        """), {
            "id": str(mount_id),
            "parent_agent_id": str(sa.parent_agent_id),
            "child_agent_id": str(new_agent_id),
            "mount_description": None,  # 使用 child 的 description
            "sort_order": idx,
            "created_at": sa.created_at,
        })

        print(f"  [{idx+1}/{len(subagents)}] SubAgent '{sa.name}' → Agent {new_agent_id}")

    print(f"Migration complete: {len(subagents)} subagents converted.")
```

## 8.3 完整 Alembic 迁移脚本

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
    # Phase 1: Schema 变更
    op.add_column('agent', sa.Column(
        'description', sa.Text(), nullable=True,
        comment='通用能力描述'
    ))

    op.create_table(
        'agent_subagent',
        sa.Column('id', UUID(), primary_key=True),
        sa.Column('parent_agent_id', UUID(),
                  sa.ForeignKey('agent.id', ondelete='CASCADE'), nullable=False),
        sa.Column('child_agent_id', UUID(),
                  sa.ForeignKey('agent.id', ondelete='CASCADE'), nullable=False),
        sa.Column('mount_description', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('parent_agent_id', 'child_agent_id',
                           name='uq_agent_subagent'),
        sa.CheckConstraint('parent_agent_id != child_agent_id',
                          name='ck_no_self_mount'),
    )
    op.create_index('ix_agent_subagent_parent', 'agent_subagent', ['parent_agent_id'])
    op.create_index('ix_agent_subagent_child', 'agent_subagent', ['child_agent_id'])

    # Phase 2: 数据迁移
    from docs.agent_unification_scripts.migrate import migrate_subagents_to_agents
    migrate_subagents_to_agents(op)

    # Phase 3: 暂不删除 subagent 表
    # 等确认数据迁移无误后，在下一个迁移中删除:
    # op.drop_table('subagent')


def downgrade():
    # 注意：downgrade 不会恢复 subagent 表的数据
    # 需要从备份恢复
    op.drop_index('ix_agent_subagent_child', 'agent_subagent')
    op.drop_index('ix_agent_subagent_parent', 'agent_subagent')
    op.drop_table('agent_subagent')
    op.drop_column('agent', 'description')
```

## 8.4 迁移验证

迁移后运行验证查询：

```sql
-- 1. 检查所有原 SubAgent 是否已转换
SELECT COUNT(*) AS original_count FROM subagent WHERE is_deleted = false;
SELECT COUNT(*) AS migrated_count FROM agent_subagent;
-- 两个数字应该相等

-- 2. 检查新 Agent 记录是否正确
SELECT a.id, a.name, a.description, a.model, a.tools
FROM agent a
JOIN agent_subagent asa ON a.id = asa.child_agent_id
ORDER BY asa.parent_agent_id, asa.sort_order;

-- 3. 检查关联关系是否正确
SELECT
    pa.name AS parent_name,
    ca.name AS child_name,
    asa.mount_description,
    asa.sort_order
FROM agent_subagent asa
JOIN agent pa ON pa.id = asa.parent_agent_id
JOIN agent ca ON ca.id = asa.child_agent_id
ORDER BY pa.name, asa.sort_order;

-- 4. 检查无循环引用
-- (应该不会有，因为迁移前 SubAgent 不支持嵌套)
```

## 8.5 后续清理（单独迁移）

确认迁移无误后，创建新的迁移脚本删除 `subagent` 表：

```python
"""drop legacy subagent table

Revision ID: yyyyyyyyyyyy
Revises: xxxxxxxxxxxx
"""

def upgrade():
    op.drop_table('subagent')

def downgrade():
    # 重建 subagent 表结构（仅结构，不恢复数据）
    op.create_table('subagent', ...)
```

## 8.6 回滚方案

如果迁移出现问题：

1. **代码回滚**：切回旧分支，旧代码仍然读 `subagent` 表
2. **数据库回滚**：`alembic downgrade <down_revision>` 删除 `agent_subagent` 表和 `description` 字段
3. **迁移产生的 Agent 记录**：需要手动清理（可通过 `created_at` 时间范围筛选）

> 建议：迁移前备份数据库。
