"""add system_config table

Revision ID: a1b2c3d4e5f0
Revises: f4a5b6c7d8e9
Create Date: 2026-03-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f0'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'system_config',
        sa.Column('key', sa.String(200), primary_key=True, comment='配置键，如 message_analyzer, embedding'),
        sa.Column('value', JSONB, nullable=False, server_default='{}', comment='配置值 (JSONB)'),
        sa.Column('description', sa.String(500), nullable=True, comment='配置描述'),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment='最后更新时间',
        ),
    )

    # Seed default configurations
    op.execute(
        """
        INSERT INTO system_config (key, value, description) VALUES
        (
            'providers',
            '{"openai": {"name": "OpenAI", "api_base_url": "https://api.openai.com/v1", "api_key": null}}'::jsonb,
            '模型服务商注册表'
        ),
        (
            'message_analyzer',
            '{"provider": "openai", "model_name": "gpt-4o-mini"}'::jsonb,
            '消息分析器模型配置'
        ),
        (
            'embedding',
            '{"provider": "openai", "model_name": "text-embedding-3-large", "dimensions": 3072, "max_tokens": 8191, "batch_size": 100}'::jsonb,
            '向量嵌入模型配置'
        ),
        (
            'agent_default',
            '{"provider": "openai", "model_name": "gpt-4o-mini"}'::jsonb,
            'Agent 默认模型配置'
        )
        """
    )


def downgrade() -> None:
    op.drop_table('system_config')
