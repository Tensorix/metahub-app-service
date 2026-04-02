"""rename_provider_sdk_to_provider_type

Revision ID: 3f2b7c1a9d4e
Revises: a1f2b3c4d5e6
Create Date: 2026-03-31 10:00:00

"""

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3f2b7c1a9d4e"
down_revision: Union[str, Sequence[str], None] = "a1f2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _convert_payload(value: dict | None, *, direction: str) -> dict:
    payload = value or {}
    converted: dict = {}

    for provider_id, raw_config in payload.items():
        if not isinstance(raw_config, dict):
            converted[provider_id] = raw_config
            continue

        item = dict(raw_config)
        if direction == "upgrade":
            provider_type = item.pop("sdk", None) or item.get("provider_type") or "openai"
            if provider_type not in {"openai", "openrouter"}:
                raise ValueError(
                    f"Unsupported provider type '{provider_type}' in providers[{provider_id}]"
                )
            item["provider_type"] = provider_type
        else:
            sdk = item.pop("provider_type", None) or item.get("sdk") or "openai"
            item["sdk"] = sdk

        converted[provider_id] = item

    return converted


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT key, value FROM system_config WHERE key = 'providers'")
    ).mappings()

    for row in rows:
        conn.execute(
            sa.text("UPDATE system_config SET value = CAST(:value AS jsonb) WHERE key = :key"),
            {
                "key": row["key"],
                "value": json.dumps(_convert_payload(row["value"], direction="upgrade")),
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT key, value FROM system_config WHERE key = 'providers'")
    ).mappings()

    for row in rows:
        conn.execute(
            sa.text("UPDATE system_config SET value = CAST(:value AS jsonb) WHERE key = :key"),
            {
                "key": row["key"],
                "value": json.dumps(_convert_payload(row["value"], direction="downgrade")),
            },
        )
