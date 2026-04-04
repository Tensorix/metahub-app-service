"""Sandbox client package — thin wrapper over OpenSandbox SDK."""

from typing import Optional

from app.sandbox.client import SandboxClient
from app.schema.system_config import SandboxConfigValue

_client: Optional[SandboxClient] = None
_client_config_hash: Optional[str] = None


def get_sandbox_client(sandbox_config: SandboxConfigValue) -> SandboxClient:
    """Return a cached SandboxClient, rebuilding if config changed."""
    global _client, _client_config_hash

    config_hash = f"{sandbox_config.api_domain}:{sandbox_config.api_key}"
    if _client is None or _client_config_hash != config_hash:
        _client = SandboxClient(sandbox_config)
        _client_config_hash = config_hash

    return _client
