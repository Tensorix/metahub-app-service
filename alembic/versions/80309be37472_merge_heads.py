"""merge heads

Revision ID: 80309be37472
Revises: 728801741212, a1b2c3d4e5f6
Create Date: 2026-02-06 00:14:21.199404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '80309be37472'
down_revision: Union[str, Sequence[str], None] = ('728801741212', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
