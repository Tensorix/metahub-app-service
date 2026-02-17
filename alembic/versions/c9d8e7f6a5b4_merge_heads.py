"""merge heads

Revision ID: c9d8e7f6a5b4
Revises: 4af2c9612823, b8c7d6e5f4a3
Create Date: 2026-02-17

Merge migration branches: document/auto_reply and knowledge vectorization.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = "b8c7d6e5f4a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
