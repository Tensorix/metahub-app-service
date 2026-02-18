"""merge interrupt_on and plain_text_for_fuzzy_search heads

Revision ID: d5e6f7a8b9c0
Revises: a1b2c3d4e5f8, e7f8a9b0c1d2
Create Date: 2026-02-18

Merge migration branches: add_interrupt_on_to_agent and add_plain_text_for_fuzzy_search.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = ("a1b2c3d4e5f8", "e7f8a9b0c1d2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
