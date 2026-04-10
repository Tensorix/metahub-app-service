"""add_activity_comment_table

Revision ID: 7a6b5c4d3e2f
Revises: 2d3e4f5a6b7c
Create Date: 2026-04-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a6b5c4d3e2f'
down_revision: Union[str, Sequence[str], None] = '2d3e4f5a6b7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'activity_comment',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column(
            'activity_id',
            sa.Uuid(),
            sa.ForeignKey('activity.id', ondelete='CASCADE'),
            nullable=False,
            comment='所属活动ID',
        ),
        sa.Column(
            'user_id',
            sa.Uuid(),
            sa.ForeignKey('user.id', ondelete='CASCADE'),
            nullable=False,
            comment='所属用户ID',
        ),
        sa.Column('content', sa.Text(), nullable=False, comment='评论内容'),
        sa.Column(
            'version',
            sa.Integer(),
            nullable=False,
            server_default=sa.text('1'),
            comment='版本号，每次更新递增',
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('UTC', now())"),
            comment='创建时间',
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('UTC', now())"),
            comment='更新时间',
        ),
        sa.Column(
            'is_deleted',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
            comment='是否删除',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_activity_comment_activity_id_created_at', 'activity_comment', ['activity_id', 'created_at'], unique=False)
    op.create_index('ix_activity_comment_user_id', 'activity_comment', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_activity_comment_user_id', table_name='activity_comment')
    op.drop_index('ix_activity_comment_activity_id_created_at', table_name='activity_comment')
    op.drop_table('activity_comment')
