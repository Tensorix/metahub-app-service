"""add_external_id_to_session_and_message

Revision ID: eb73a2a73640
Revises: 8f5d92a6e104
Create Date: 2026-01-21 21:19:37.323543

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eb73a2a73640'
down_revision: Union[str, Sequence[str], None] = '8f5d92a6e104'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 为 session 表添加 external_id 字段
    op.add_column('session', sa.Column('external_id', sa.String(length=255), nullable=True, comment='外部系统的会话ID'))
    op.create_index(op.f('ix_session_external_id'), 'session', ['external_id'], unique=False)
    
    # 为 message 表添加 external_id 字段
    op.add_column('message', sa.Column('external_id', sa.String(length=255), nullable=True, comment='外部系统的消息ID'))
    op.create_index(op.f('ix_message_external_id'), 'message', ['external_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # 删除 message 表的 external_id 字段
    op.drop_index(op.f('ix_message_external_id'), table_name='message')
    op.drop_column('message', 'external_id')
    
    # 删除 session 表的 external_id 字段
    op.drop_index(op.f('ix_session_external_id'), table_name='session')
    op.drop_column('session', 'external_id')
