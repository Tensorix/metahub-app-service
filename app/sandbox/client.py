"""Thin async wrapper around the OpenSandbox SDK."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Optional

from opensandbox.config import ConnectionConfig
from opensandbox.models.filesystem import WriteEntry
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
        self._handles: dict[str, Sandbox] = {}

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
        self._handles[sandbox.id] = sandbox
        return sandbox

    async def connect(self, sandbox_id: str) -> Sandbox:
        """Connect to an existing running sandbox by ID (cached)."""
        if sandbox_id in self._handles:
            return self._handles[sandbox_id]
        sandbox = await Sandbox.connect(
            sandbox_id,
            connection_config=self._config,
            skip_health_check=True,
        )
        self._handles[sandbox_id] = sandbox
        return sandbox

    async def kill(self, sandbox_id: str) -> None:
        """Terminate a sandbox immediately."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.kill()
        await sandbox.close()
        self._handles.pop(sandbox_id, None)

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

    @staticmethod
    def _collect_output(messages) -> str:
        """Join OutputMessage list into a single string."""
        return "\n".join(m.text for m in (messages or []))

    async def run_command(self, sandbox_id: str, command: str) -> dict[str, Any]:
        """Run a shell command inside the sandbox."""
        sandbox = await self.connect(sandbox_id)
        result = await sandbox.commands.run(command)
        return {
            "exit_code": result.exit_code,
            "stdout": self._collect_output(result.logs.stdout),
            "stderr": self._collect_output(result.logs.stderr),
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
        """List immediate children of *path* (single level)."""
        sandbox = await self.connect(sandbox_id)
        # SDK search is recursive; use ls command for single-level listing
        norm = path.rstrip("/") or "/"
        result = await sandbox.commands.run(
            f"ls -1apL --group-directories-first {norm}"
        )
        stdout = self._collect_output(result.logs.stdout)
        entries: list[dict[str, Any]] = []
        for line in stdout.strip().splitlines():
            line = line.strip()
            if not line or line in ("./", "../"):
                continue
            is_dir = line.endswith("/")
            name = line.rstrip("/")
            entry_path = f"{norm}/{name}" if norm != "/" else f"/{name}"
            entries.append({
                "name": name,
                "path": entry_path,
                "is_dir": is_dir,
                "size": None,
            })
        return entries

    async def delete_file(self, sandbox_id: str, path: str) -> None:
        """Delete a single file from the sandbox."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.files.delete_files([path])

    # ------------------------------------------------------------------
    # Terminal helpers (non-session, cwd tracked per-command)
    # ------------------------------------------------------------------

    # Sentinel written to stderr so the WS handler can extract the
    # post-command working directory without polluting stdout.
    CWD_SENTINEL = "__CWD_SENTINEL__"

    async def run_terminal_command(
        self,
        sandbox_id: str,
        command: str,
        cwd: str = "/workspace",
        *,
        on_stdout=None,
        on_stderr=None,
    ):
        """Run a one-shot command with streaming callbacks.

        Wraps *command* so that the resulting working directory is
        emitted on stderr between CWD_SENTINEL markers.  The caller
        should strip those lines from user-visible output and use the
        value to update its tracked cwd.

        Returns the ``Execution`` object (has ``.exit_code``, ``.id``).
        """
        from opensandbox.models.execd import ExecutionHandlers

        # The wrapper:
        #  1. cd into tracked cwd
        #  2. Execute the user command (which may itself cd)
        #  3. Capture exit code
        #  4. Emit current pwd wrapped in sentinels on stderr
        #  5. Exit with the original exit code
        wrapped = (
            f'cd {_shell_quote(cwd)} && {{ {command} ; }}; '
            f'__ec=$?; '
            f'echo "{self.CWD_SENTINEL}$(pwd){self.CWD_SENTINEL}" >&2; '
            f'exit $__ec'
        )

        handlers = ExecutionHandlers(
            on_stdout=on_stdout,
            on_stderr=on_stderr,
        )
        sandbox = await self.connect(sandbox_id)
        return await sandbox.commands.run(wrapped, handlers=handlers)

    async def interrupt_execution(
        self, sandbox_id: str, execution_id: str
    ) -> None:
        """Interrupt a running command execution."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.commands.interrupt(execution_id)


def _shell_quote(s: str) -> str:
    """Single-quote a string for safe shell interpolation."""
    return "'" + s.replace("'", "'\\''") + "'"
