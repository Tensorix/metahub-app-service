"""merge_heads

Revision ID: 8070721d443f
Revises: 6d765f624ca0, abc123def456
Create Date: 2026-02-06 15:20:45.415126

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8070721d443f'
down_revision: Union[str, Sequence[str], None] = ('6d765f624ca0', 'abc123def456')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
