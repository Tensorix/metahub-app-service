"""add_user_id_and_version_to_message_table

Revision ID: 7e4c81977053
Revises: 0d8e7f9c8696
Create Date: 2026-01-21 11:26:12.897662

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e4c81977053'
down_revision: Union[str, Sequence[str], None] = '0d8e7f9c8696'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 为 message 表添加 user_id 和 version 字段
    op.add_column('message', sa.Column('user_id', sa.UUID(), nullable=True))
    op.add_column('message', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    
    # 创建外键约束和索引
    op.create_foreign_key('fk_message_user_id', 'message', 'user', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_message_user_id', 'message', ['user_id'])
    
    # 将 user_id 设置为 NOT NULL（在设置默认值后）
    # 注意：在生产环境中，需要先为现有数据设置 user_id 值
    # 可以通过 session 表关联获取 user_id：
    # UPDATE message SET user_id = (SELECT user_id FROM session WHERE session.id = message.session_id);
    # op.alter_column('message', 'user_id', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    # 删除索引和外键
    op.drop_index('ix_message_user_id', 'message')
    op.drop_constraint('fk_message_user_id', 'message', type_='foreignkey')
    
    # 删除列
    op.drop_column('message', 'version')
    op.drop_column('message', 'user_id')
