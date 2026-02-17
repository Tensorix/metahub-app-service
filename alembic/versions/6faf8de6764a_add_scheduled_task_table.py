"""add_scheduled_task_table

Revision ID: 6faf8de6764a
Revises: c9d8e7f6a5b4
Create Date: 2026-02-17 04:27:04.878344

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6faf8de6764a'
down_revision: Union[str, Sequence[str], None] = 'c9d8e7f6a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('scheduled_task',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('schedule_type', sa.String(length=20), nullable=False),
        sa.Column('schedule_config', sa.JSON(), nullable=False),
        sa.Column('timezone', sa.String(length=50), nullable=False),
        sa.Column('task_type', sa.String(length=50), nullable=False),
        sa.Column('task_params', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_run_status', sa.String(length=20), nullable=True),
        sa.Column('last_run_error', sa.Text(), nullable=True),
        sa.Column('next_run_at', sa.DateTime(), nullable=True),
        sa.Column('run_count', sa.Integer(), nullable=False),
        sa.Column('max_runs', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_scheduled_task_status'), 'scheduled_task', ['status'], unique=False)
    op.create_index(op.f('ix_scheduled_task_task_type'), 'scheduled_task', ['task_type'], unique=False)
    op.create_index(op.f('ix_scheduled_task_user_id'), 'scheduled_task', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_scheduled_task_user_id'), table_name='scheduled_task')
    op.drop_index(op.f('ix_scheduled_task_task_type'), table_name='scheduled_task')
    op.drop_index(op.f('ix_scheduled_task_status'), table_name='scheduled_task')
    op.drop_table('scheduled_task')
