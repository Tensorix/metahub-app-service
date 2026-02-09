"""unify agent and subagent

Revision ID: a1f2b3c4d5e6
Revises: 80309be37472
Create Date: 2026-02-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import text
from uuid import uuid4


# revision identifiers, used by Alembic.
revision: str = 'a1f2b3c4d5e6'
down_revision: Union[str, None] = '8070721d443f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def migrate_subagents_to_agents(conn):
    """将 subagent 表中的记录转换为 agent + agent_subagent。"""
    
    # 1. 读取所有未删除的 SubAgent 记录
    result = conn.execute(text("""
        SELECT id, parent_agent_id, name, description, 
               system_prompt, model, tools,
               created_at, updated_at
        FROM subagent
        WHERE is_deleted = false
    """))
    subagents = result.fetchall()

    if not subagents:
        print("No subagent records to migrate.")
        return

    print(f"Migrating {len(subagents)} subagent records...")

    for idx, sa in enumerate(subagents):
        new_agent_id = str(uuid4())

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
            "id": new_agent_id,
            "name": sa.name,
            "description": sa.description,
            "system_prompt": sa.system_prompt,
            "model": sa.model,
            "tools": sa.tools,
            "created_at": sa.created_at,
            "updated_at": sa.updated_at,
        })

        # 3. 创建 agent_subagent 关联记录
        mount_id = str(uuid4())
        conn.execute(text("""
            INSERT INTO agent_subagent (
                id, parent_agent_id, child_agent_id,
                mount_description, sort_order, created_at
            ) VALUES (
                :id, :parent_agent_id, :child_agent_id,
                :mount_description, :sort_order, :created_at
            )
        """), {
            "id": mount_id,
            "parent_agent_id": str(sa.parent_agent_id),
            "child_agent_id": new_agent_id,
            "mount_description": None,  # 使用 child 的 description
            "sort_order": idx,
            "created_at": sa.created_at,
        })

        print(f"  [{idx+1}/{len(subagents)}] SubAgent '{sa.name}' → Agent {new_agent_id}")

    print(f"Migration complete: {len(subagents)} subagents converted.")


def upgrade() -> None:
    """Upgrade schema."""
    # Phase 1: Schema 变更
    
    # 1. agent 表新增 description 字段
    op.add_column('agent', sa.Column(
        'description', sa.Text(), nullable=True,
        comment='通用能力描述'
    ))

    # 2. 创建 agent_subagent 关联表
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
    conn = op.get_bind()
    migrate_subagents_to_agents(conn)

    # Phase 3: 暂不删除 subagent 表
    # 等确认数据迁移无误后，在下一个迁移中删除


def downgrade() -> None:
    """Downgrade schema."""
    # 注意：downgrade 不会恢复 subagent 表的数据
    # 需要从备份恢复
    op.drop_index('ix_agent_subagent_child', 'agent_subagent')
    op.drop_index('ix_agent_subagent_parent', 'agent_subagent')
    op.drop_table('agent_subagent')
    op.drop_column('agent', 'description')
