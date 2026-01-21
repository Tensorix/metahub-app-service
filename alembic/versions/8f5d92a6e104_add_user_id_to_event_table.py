"""add_user_id_to_event_table

Revision ID: 8f5d92a6e104
Revises: 7e4c81977053
Create Date: 2026-01-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f5d92a6e104'
down_revision: Union[str, Sequence[str], None] = '7e4c81977053'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 为 event 表添加 user_id 字段
    op.add_column('event', sa.Column('user_id', sa.UUID(), nullable=True))
    
    # 创建外键约束和索引
    op.create_foreign_key('fk_event_user_id', 'event', 'user', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_event_user_id', 'event', ['user_id'])
    
    # 将 user_id 设置为 NOT NULL（在设置默认值后）
    # 注意：在生产环境中，需要先为现有数据设置 user_id 值
    # 如果有现有数据，可以设置为默认用户或删除旧数据
    # op.alter_column('event', 'user_id', nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    # 删除索引和外键
    op.drop_index('ix_event_user_id', 'event')
    op.drop_constraint('fk_event_user_id', 'event', type_='foreignkey')
    
    # 删除列
    op.drop_column('event', 'user_id')
