"""add_background_task_table

Revision ID: 728801741212
Revises: f1b3eaa785ac
Create Date: 2026-02-05 22:20:27.890839

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '728801741212'
down_revision: Union[str, Sequence[str], None] = 'f1b3eaa785ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('background_task',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('task_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=True),
        sa.Column('total_items', sa.Integer(), nullable=False),
        sa.Column('processed_items', sa.Integer(), nullable=False),
        sa.Column('failed_items', sa.Integer(), nullable=False),
        sa.Column('params', sa.JSON(), nullable=True),
        sa.Column('result', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['session.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_background_task_session_id'), 'background_task', ['session_id'], unique=False)
    op.create_index(op.f('ix_background_task_status'), 'background_task', ['status'], unique=False)
    op.create_index(op.f('ix_background_task_task_type'), 'background_task', ['task_type'], unique=False)
    op.create_index(op.f('ix_background_task_user_id'), 'background_task', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_background_task_user_id'), table_name='background_task')
    op.drop_index(op.f('ix_background_task_task_type'), table_name='background_task')
    op.drop_index(op.f('ix_background_task_status'), table_name='background_task')
    op.drop_index(op.f('ix_background_task_session_id'), table_name='background_task')
    op.drop_table('background_task')
