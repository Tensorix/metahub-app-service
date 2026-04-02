"""merge provider type and system config heads

Revision ID: 97415481099e
Revises: 3f2b7c1a9d4e, a1b2c3d4e5f0
Create Date: 2026-04-02 15:04:03.422739

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '97415481099e'
down_revision: Union[str, Sequence[str], None] = ('3f2b7c1a9d4e', 'a1b2c3d4e5f0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
