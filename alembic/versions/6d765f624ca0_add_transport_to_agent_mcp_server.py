"""add_transport_to_agent_mcp_server

Revision ID: 6d765f624ca0
Revises: 80309be37472
Create Date: 2026-02-06 00:42:56.796744

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d765f624ca0'
down_revision: Union[str, Sequence[str], None] = '80309be37472'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add transport column to agent_mcp_server table."""
    # Add transport column with default 'http'
    op.add_column(
        'agent_mcp_server',
        sa.Column('transport', sa.String(50), nullable=False, server_default='http')
    )


def downgrade() -> None:
    """Remove transport column from agent_mcp_server table."""
    op.drop_column('agent_mcp_server', 'transport')
