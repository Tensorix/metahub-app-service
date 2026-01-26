"""add_skills_and_memory_files_to_agent

Revision ID: 9bdd44968ec6
Revises: 62ce0e232e8b
Create Date: 2026-01-26 22:52:15.078865

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9bdd44968ec6'
down_revision: Union[str, Sequence[str], None] = '62ce0e232e8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add skills column to agent table
    op.add_column(
        'agent',
        sa.Column(
            'skills',
            sa.dialects.postgresql.JSONB(),
            nullable=True,
            comment='技能目录路径列表'
        )
    )
    
    # Add memory_files column to agent table
    op.add_column(
        'agent',
        sa.Column(
            'memory_files',
            sa.dialects.postgresql.JSONB(),
            nullable=True,
            comment='记忆文件路径列表'
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove memory_files column from agent table
    op.drop_column('agent', 'memory_files')
    
    # Remove skills column from agent table
    op.drop_column('agent', 'skills')
