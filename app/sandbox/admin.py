"""Admin/management helpers built on opensandbox.SandboxManager.

These helpers create short-lived SandboxManager instances per operation.
Short-lived managers avoid the event-loop caching pitfalls documented in
app/sandbox/client.py (see MEMORY.md: "Sandbox Async/Event Loop Architecture")
because each call owns its own transport and closes it before returning.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from opensandbox.config import ConnectionConfig
from opensandbox.manager import SandboxManager
from opensandbox.models.sandboxes import (
    PagedSandboxInfos,
    SandboxFilter,
    SandboxInfo,
)

from app.schema.system_config import SandboxConfigValue

logger = logging.getLogger(__name__)


def _build_connection_config(sandbox_config: SandboxConfigValue) -> ConnectionConfig:
    return ConnectionConfig(
        domain=sandbox_config.api_domain,
        api_key=sandbox_config.api_key,
        use_server_proxy=sandbox_config.use_server_proxy,
    )


async def list_sandboxes(
    sandbox_config: SandboxConfigValue,
    *,
    states: Optional[list[str]] = None,
    metadata: Optional[dict[str, str]] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> PagedSandboxInfos:
    """List sandboxes via the OpenSandbox admin API."""
    manager = await SandboxManager.create(
        connection_config=_build_connection_config(sandbox_config)
    )
    try:
        return await manager.list_sandbox_infos(
            SandboxFilter(
                states=states,
                metadata=metadata,
                page=page,
                page_size=page_size,
            )
        )
    finally:
        await manager.close()


async def get_sandbox_info(
    sandbox_config: SandboxConfigValue,
    sandbox_id: str,
) -> SandboxInfo:
    """Fetch a single sandbox's info via the admin API."""
    manager = await SandboxManager.create(
        connection_config=_build_connection_config(sandbox_config)
    )
    try:
        return await manager.get_sandbox_info(sandbox_id)
    finally:
        await manager.close()


async def kill_sandbox(
    sandbox_config: SandboxConfigValue,
    sandbox_id: str,
) -> None:
    """Terminate a sandbox via the admin API."""
    manager = await SandboxManager.create(
        connection_config=_build_connection_config(sandbox_config)
    )
    try:
        await manager.kill_sandbox(sandbox_id)
    finally:
        await manager.close()


def sandbox_info_to_dict(info: SandboxInfo) -> dict[str, Any]:
    """Normalize a SandboxInfo into a plain dict suitable for our response schema."""
    image_ref: Optional[str] = None
    if info.image is not None:
        image_ref = info.image.image

    return {
        "id": info.id,
        "status": {
            "state": info.status.state,
            "reason": info.status.reason,
            "message": info.status.message,
            "last_transition_at": info.status.last_transition_at,
        },
        "entrypoint": list(info.entrypoint or []),
        "image": image_ref,
        "expires_at": info.expires_at,
        "created_at": info.created_at,
        "metadata": info.metadata,
    }
