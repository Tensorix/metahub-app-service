"""add_session_sandbox_table

Revision ID: 830d34d2cc80
Revises: 97415481099e
Create Date: 2026-04-03 23:14:35.083570

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '830d34d2cc80'
down_revision: Union[str, Sequence[str], None] = '97415481099e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('session_sandbox',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('session_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('sandbox_id', sa.String(), nullable=True, comment='Remote OpenSandbox ID'),
    sa.Column('status', sa.String(length=32), nullable=False, comment='creating | running | paused | stopping | stopped | error'),
    sa.Column('image', sa.String(length=255), nullable=False),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Resource limits, env vars, etc.'),
    sa.Column('error_message', sa.String(), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('UTC', now())"), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('UTC', now())"), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['session.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_session_sandbox_session_id'), 'session_sandbox', ['session_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_session_sandbox_session_id'), table_name='session_sandbox')
    op.drop_table('session_sandbox')
