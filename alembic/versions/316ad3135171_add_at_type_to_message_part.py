"""add_at_type_to_message_part

Revision ID: 316ad3135171
Revises: eb73a2a73640
Create Date: 2026-01-21 23:09:16.808715

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '316ad3135171'
down_revision: Union[str, Sequence[str], None] = 'eb73a2a73640'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
