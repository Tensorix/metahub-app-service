"""add_summarization_config_to_agent

Revision ID: 1e62baab2685
Revises: 9bdd44968ec6
Create Date: 2026-01-27 01:30:13.642497

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e62baab2685'
down_revision: Union[str, Sequence[str], None] = '9bdd44968ec6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add summarization_config column to agent table
    op.add_column(
        'agent',
        sa.Column(
            'summarization_config',
            sa.dialects.postgresql.JSONB(),
            nullable=True,
            comment='对话摘要配置'
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove summarization_config column from agent table
    op.drop_column('agent', 'summarization_config')
