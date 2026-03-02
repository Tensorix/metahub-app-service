"""add sort_order to activity table

Revision ID: f4a5b6c7d8e9
Revises: d5e6f7a8b9c0
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add sort_order column to activity table."""
    op.add_column(
        'activity',
        sa.Column(
            'sort_order',
            sa.Integer(),
            nullable=False,
            server_default=sa.text('0'),
            comment='排序序号，数字越小越靠前',
        ),
    )
    op.create_index('ix_activity_sort_order', 'activity', ['sort_order'])


def downgrade() -> None:
    """Remove sort_order column from activity table."""
    op.drop_index('ix_activity_sort_order', 'activity')
    op.drop_column('activity', 'sort_order')
