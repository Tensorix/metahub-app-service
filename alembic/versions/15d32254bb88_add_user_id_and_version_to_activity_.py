"""add_user_id_and_version_to_activity_session_topic

Revision ID: 15d32254bb88
Revises: ba65601ec343
Create Date: 2026-01-20 21:29:57.637781

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '15d32254bb88'
down_revision: Union[str, Sequence[str], None] = 'ba65601ec343'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 为 activity 表添加 user_id 和 version 字段
    op.add_column('activity', sa.Column('user_id', sa.UUID(), nullable=True))
    op.add_column('activity', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    
    # 为 session 表添加 user_id 和 version 字段
    op.add_column('session', sa.Column('user_id', sa.UUID(), nullable=True))
    op.add_column('session', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    
    # 为 topic 表添加 user_id 和 version 字段
    op.add_column('topic', sa.Column('user_id', sa.UUID(), nullable=True))
    op.add_column('topic', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    
    # 创建外键约束和索引
    op.create_foreign_key('fk_activity_user_id', 'activity', 'user', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_activity_user_id', 'activity', ['user_id'])
    
    op.create_foreign_key('fk_session_user_id', 'session', 'user', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_session_user_id', 'session', ['user_id'])
    
    op.create_foreign_key('fk_topic_user_id', 'topic', 'user', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_topic_user_id', 'topic', ['user_id'])
    
    # 将 user_id 设置为 NOT NULL（在设置默认值后）
    # 注意：在生产环境中，需要先为现有数据设置 user_id 值
    # op.alter_column('activity', 'user_id', nullable=False)
    # op.alter_column('session', 'user_id', nullable=False)
    # op.alter_column('topic', 'user_id', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    # 删除索引和外键
    op.drop_index('ix_topic_user_id', 'topic')
    op.drop_constraint('fk_topic_user_id', 'topic', type_='foreignkey')
    
    op.drop_index('ix_session_user_id', 'session')
    op.drop_constraint('fk_session_user_id', 'session', type_='foreignkey')
    
    op.drop_index('ix_activity_user_id', 'activity')
    op.drop_constraint('fk_activity_user_id', 'activity', type_='foreignkey')
    
    # 删除列
    op.drop_column('topic', 'version')
    op.drop_column('topic', 'user_id')
    
    op.drop_column('session', 'version')
    op.drop_column('session', 'user_id')
    
    op.drop_column('activity', 'version')
    op.drop_column('activity', 'user_id')
