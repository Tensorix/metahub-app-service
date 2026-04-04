"""Thin async wrapper around the OpenSandbox SDK."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Optional

from opensandbox.config import ConnectionConfig
from opensandbox.models.filesystem import SearchEntry, WriteEntry
from opensandbox.sandbox import Sandbox

from app.schema.system_config import SandboxConfigValue

logger = logging.getLogger(__name__)


class SandboxClient:
    """Manages sandbox instances using the OpenSandbox SDK."""

    def __init__(self, sandbox_config: SandboxConfigValue) -> None:
        self._config = ConnectionConfig(
            domain=sandbox_config.api_domain,
            api_key=sandbox_config.api_key,
        )

    async def create(
        self,
        image: str = "ubuntu",
        timeout: int = 600,
        env: Optional[dict[str, str]] = None,
    ) -> Sandbox:
        """Provision a new sandbox and return the SDK handle."""
        sandbox = await Sandbox.create(
            image,
            connection_config=self._config,
            timeout=timedelta(seconds=timeout),
            env=env or {},
        )
        return sandbox

    async def connect(self, sandbox_id: str) -> Sandbox:
        """Connect to an existing running sandbox by ID."""
        return await Sandbox.connect(sandbox_id, connection_config=self._config)

    async def kill(self, sandbox_id: str) -> None:
        """Terminate a sandbox immediately."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.kill()
        await sandbox.close()

    async def get_info(self, sandbox_id: str) -> dict[str, Any]:
        """Retrieve sandbox metadata / status."""
        sandbox = await self.connect(sandbox_id)
        return await sandbox.get_info()

    async def renew(self, sandbox_id: str, duration: int) -> None:
        """Extend sandbox lifetime."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.renew(timedelta(seconds=duration))

    # ------------------------------------------------------------------
    # Command execution
    # ------------------------------------------------------------------

    async def run_command(self, sandbox_id: str, command: str) -> dict[str, Any]:
        """Run a shell command inside the sandbox."""
        sandbox = await self.connect(sandbox_id)
        result = await sandbox.commands.run(command)
        return {
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    # ------------------------------------------------------------------
    # Filesystem operations
    # ------------------------------------------------------------------

    async def read_file(self, sandbox_id: str, path: str) -> str:
        """Read a single file from the sandbox."""
        sandbox = await self.connect(sandbox_id)
        return await sandbox.files.read_file(path)

    async def write_file(self, sandbox_id: str, path: str, content: str) -> None:
        """Write a single file into the sandbox."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.files.write_files([WriteEntry(path=path, data=content)])

    async def list_files(self, sandbox_id: str, path: str = "/") -> list[dict[str, Any]]:
        """List files matching ``*`` under *path*."""
        sandbox = await self.connect(sandbox_id)
        entries = await sandbox.files.search(SearchEntry(path=path, pattern="*"))
        return [
            {"name": e.name, "path": e.path, "is_dir": e.is_dir, "size": getattr(e, "size", None)}
            for e in entries
        ]

    async def delete_file(self, sandbox_id: str, path: str) -> None:
        """Delete a single file from the sandbox."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.files.delete_files([path])
