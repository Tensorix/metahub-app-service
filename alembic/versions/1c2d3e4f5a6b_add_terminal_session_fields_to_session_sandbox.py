"""add_terminal_session_fields_to_session_sandbox

Revision ID: 1c2d3e4f5a6b
Revises: 830d34d2cc80
Create Date: 2026-04-05 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c2d3e4f5a6b'
down_revision: Union[str, Sequence[str], None] = '830d34d2cc80'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'session_sandbox',
        sa.Column(
            'terminal_session_id',
            sa.String(),
            nullable=True,
            comment='Remote OpenSandbox PTY session ID',
        ),
    )
    op.add_column(
        'session_sandbox',
        sa.Column('terminal_session_created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'session_sandbox',
        sa.Column('terminal_session_last_seen_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('session_sandbox', 'terminal_session_last_seen_at')
    op.drop_column('session_sandbox', 'terminal_session_created_at')
    op.drop_column('session_sandbox', 'terminal_session_id')
