"""add_external_id_to_message_sender

Revision ID: f1b3eaa785ac
Revises: d1e2f3a4b5c6
Create Date: 2026-02-04 11:11:57.734369

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1b3eaa785ac'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add external_id column to message_sender table
    op.add_column(
        'message_sender',
        sa.Column('external_id', sa.String(255), nullable=True, comment='外部系统的唯一标识符（如QQ UID、Webhook sender_id等）')
    )
    
    # Add unique index on external_id for fast lookup and deduplication
    op.create_index(
        'ix_message_sender_external_id',
        'message_sender',
        ['external_id'],
        unique=False  # Not unique because external_id can be NULL
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop index first
    op.drop_index('ix_message_sender_external_id', table_name='message_sender')
    
    # Drop column
    op.drop_column('message_sender', 'external_id')
