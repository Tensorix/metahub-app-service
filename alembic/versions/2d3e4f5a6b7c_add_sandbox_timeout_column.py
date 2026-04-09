"""add_sandbox_timeout_column

Revision ID: 2d3e4f5a6b7c
Revises: 1c2d3e4f5a6b
Create Date: 2026-04-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2d3e4f5a6b7c'
down_revision: Union[str, Sequence[str], None] = '1c2d3e4f5a6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'session_sandbox',
        sa.Column(
            'timeout',
            sa.Integer(),
            nullable=True,
            comment='Desired timeout in seconds for next sandbox start',
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('session_sandbox', 'timeout')
