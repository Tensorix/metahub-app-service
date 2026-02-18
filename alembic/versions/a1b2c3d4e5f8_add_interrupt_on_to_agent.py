"""add_interrupt_on_to_agent

Revision ID: a1b2c3d4e5f8
Revises: 6faf8de6764a
Create Date: 2026-02-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f8'
down_revision: Union[str, Sequence[str], None] = '6faf8de6764a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'agent',
        sa.Column(
            'interrupt_on',
            postgresql.JSONB(),
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
            comment='工具需人工批准配置: {tool_name: true|false|{allowed_decisions}}'
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('agent', 'interrupt_on')
