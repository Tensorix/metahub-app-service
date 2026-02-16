"""merge document and auto_reply heads

Revision ID: 4af2c9612823
Revises: 086daa71973b, a1b2c3d4e5f7
Create Date: 2026-02-17 00:10:34.353467

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4af2c9612823'
down_revision: Union[str, Sequence[str], None] = ('086daa71973b', 'a1b2c3d4e5f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
