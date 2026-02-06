"""add_message_str

Revision ID: abc123def456
Revises: f1b3eaa785ac
Create Date: 2026-02-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'abc123def456'
down_revision: Union[str, Sequence[str], None] = 'f1b3eaa785ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'message',
        sa.Column(
            'message_str',
            sa.Text(),
            nullable=True,
            comment='消息纯文本内容，由 parts 合成，用于检索和统一处理'
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('message', 'message_str')
