"""Thin async wrapper around the OpenSandbox SDK."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from opensandbox.config import ConnectionConfig
from opensandbox.constants import DEFAULT_EXECD_PORT
from opensandbox.models.filesystem import WriteEntry
from opensandbox.models.sandboxes import SandboxEndpoint
from opensandbox.sandbox import Sandbox
import websockets

from app.schema.system_config import SandboxConfigValue

logger = logging.getLogger(__name__)


class SandboxPtySessionNotFoundError(Exception):
    """Raised when an upstream PTY session no longer exists."""


class SandboxPtyUnsupportedError(Exception):
    """Raised when the upstream execd does not support PTY APIs."""


@dataclass(slots=True)
class SandboxPtySessionStatus:
    session_id: str
    running: bool
    output_offset: int


class SandboxClient:
    """Manages sandbox instances using the OpenSandbox SDK."""

    def __init__(self, sandbox_config: SandboxConfigValue) -> None:
        self._config = ConnectionConfig(
            domain=sandbox_config.api_domain,
            api_key=sandbox_config.api_key,
            use_server_proxy=sandbox_config.use_server_proxy,
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

    async def get_endpoint(self, sandbox_id: str, port: int) -> SandboxEndpoint:
        """Resolve a network endpoint for an arbitrary sandbox port."""
        sandbox = await self.connect(sandbox_id)
        return await sandbox.get_endpoint(port)

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
        on_init=None,
        on_execution_complete=None,
        on_error=None,
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
            on_init=on_init,
            on_execution_complete=on_execution_complete,
            on_error=on_error,
        )
        sandbox = await self.connect(sandbox_id)
        return await sandbox.commands.run(wrapped, handlers=handlers)

    async def interrupt_execution(
        self, sandbox_id: str, execution_id: str
    ) -> None:
        """Interrupt a running command execution."""
        sandbox = await self.connect(sandbox_id)
        await sandbox.commands.interrupt(execution_id)

    # ------------------------------------------------------------------
    # PTY terminal helpers (interactive shell)
    # ------------------------------------------------------------------

    async def create_pty_session(
        self,
        sandbox_id: str,
        cwd: str | None = None,
    ) -> str:
        """Create a PTY session via execd."""
        payload: dict[str, str] = {}
        if cwd:
            payload["cwd"] = cwd

        response = await self._execd_request(
            sandbox_id,
            "POST",
            "/pty",
            json=payload,
        )
        session_id = response.json().get("session_id")
        if not session_id:
            raise RuntimeError("PTY create response missing session_id")
        return session_id

    async def resolve_pty_cwd(
        self,
        sandbox_id: str,
        *,
        preferred: str = "/workspace",
    ) -> str | None:
        """Resolve a safe PTY cwd, falling back when preferred path is missing.

        Why this exists:
        PTY startup can fail with a misleading `fork/exec ... no such file or directory`
        when `cmd.Dir` points to a non-existent directory. We probe first and return a
        known-good absolute directory.
        """
        probe = (
            f"if [ -d {_shell_quote(preferred)} ]; then "
            f"printf '%s' {_shell_quote(preferred)}; "
            "else pwd -P; fi"
        )

        try:
            result = await self.run_command(sandbox_id, probe)
        except Exception:
            return None

        exit_code = result.get("exit_code")
        if exit_code is None or int(exit_code) != 0:
            return None

        stdout = (result.get("stdout") or "").strip()
        if not stdout:
            return None

        cwd = stdout.splitlines()[-1].strip()
        if not cwd.startswith("/"):
            return None

        return cwd

    async def get_pty_session_status(
        self,
        sandbox_id: str,
        pty_session_id: str,
    ) -> SandboxPtySessionStatus:
        """Return PTY session status from execd."""
        response = await self._execd_request(
            sandbox_id,
            "GET",
            f"/pty/{pty_session_id}",
        )
        data = response.json()
        return SandboxPtySessionStatus(
            session_id=data.get("session_id") or pty_session_id,
            running=bool(data.get("running")),
            output_offset=int(data.get("output_offset") or 0),
        )

    async def delete_pty_session(
        self,
        sandbox_id: str,
        pty_session_id: str,
    ) -> None:
        """Delete a PTY session via execd."""
        await self._execd_request(
            sandbox_id,
            "DELETE",
            f"/pty/{pty_session_id}",
        )

    async def connect_pty_websocket(
        self,
        sandbox_id: str,
        pty_session_id: str,
        *,
        since: int = 0,
        pty: bool | None = None,
    ):
        """Attach to the PTY WebSocket for a session."""
        endpoint = await self._get_execd_endpoint(sandbox_id)
        query: dict[str, Any] = {"since": since}
        if pty is not None:
            query["pty"] = 1 if pty else 0
        ws_url = self._execd_websocket_url(
            endpoint,
            f"/pty/{pty_session_id}/ws",
            query,
        )
        timeout_seconds = self._config.request_timeout.total_seconds()
        return await websockets.connect(
            ws_url,
            additional_headers=self._execd_headers(endpoint),
            open_timeout=timeout_seconds,
            ping_interval=None,
            max_size=None,
            compression=None,
        )

    async def _get_execd_endpoint(self, sandbox_id: str) -> SandboxEndpoint:
        return await self.get_endpoint(sandbox_id, DEFAULT_EXECD_PORT)

    async def request_endpoint(
        self,
        endpoint: SandboxEndpoint,
        method: str,
        path: str,
        *,
        headers: dict[str, str] | None = None,
        params: Any = None,
        content: bytes | None = None,
        follow_redirects: bool = False,
    ) -> httpx.Response:
        """Issue an HTTP request against a resolved sandbox endpoint."""
        timeout_seconds = self._config.request_timeout.total_seconds()
        base_url = self._endpoint_base_url(endpoint).rstrip("/") + "/"
        resource_path = path.lstrip("/")
        request_headers = self._endpoint_headers(endpoint)
        if headers:
            request_headers.update(headers)

        async with httpx.AsyncClient(
            base_url=base_url,
            headers=request_headers,
            timeout=httpx.Timeout(timeout_seconds),
            transport=self._config.transport,
            follow_redirects=follow_redirects,
        ) as client:
            return await client.request(
                method,
                resource_path,
                params=params,
                content=content,
            )

    async def _execd_request(
        self,
        sandbox_id: str,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> httpx.Response:
        endpoint = await self._get_execd_endpoint(sandbox_id)
        timeout_seconds = self._config.request_timeout.total_seconds()
        base_url = self._execd_base_url(endpoint).rstrip("/") + "/"
        resource_path = path.lstrip("/")

        async with httpx.AsyncClient(
            base_url=base_url,
            headers=self._execd_headers(endpoint),
            timeout=httpx.Timeout(timeout_seconds),
            transport=self._config.transport,
        ) as client:
            response = await client.request(method, resource_path, json=json)

        if response.status_code == 404:
            # 404 on PTY create means this execd runtime likely has no PTY API.
            if method.upper() == "POST" and resource_path == "pty":
                raise SandboxPtyUnsupportedError(
                    f"PTY API is not available on upstream execd: {path}"
                )
            raise SandboxPtySessionNotFoundError(
                f"PTY session resource not found: {path}"
            )
        response.raise_for_status()
        return response

    def _execd_headers(self, endpoint: SandboxEndpoint) -> dict[str, str]:
        return self._endpoint_headers(endpoint)

    def _execd_base_url(self, endpoint: SandboxEndpoint) -> str:
        return self._endpoint_base_url(endpoint)

    def _endpoint_headers(self, endpoint: SandboxEndpoint) -> dict[str, str]:
        return {
            "User-Agent": self._config.user_agent,
            **self._config.headers,
            **endpoint.headers,
        }

    def _endpoint_base_url(self, endpoint: SandboxEndpoint) -> str:
        raw = endpoint.endpoint.rstrip("/")
        if raw.startswith(("http://", "https://")):
            return raw
        return f"{self._config.protocol}://{raw}"

    def _execd_websocket_url(
        self,
        endpoint: SandboxEndpoint,
        path: str,
        query: dict[str, Any] | None = None,
    ) -> str:
        base_url = self._execd_base_url(endpoint)
        if base_url.startswith("https://"):
            ws_base = "wss://" + base_url[len("https://") :]
        elif base_url.startswith("http://"):
            ws_base = "ws://" + base_url[len("http://") :]
        elif base_url.startswith(("ws://", "wss://")):
            ws_base = base_url
        else:
            ws_base = f"ws://{base_url}"

        url = f"{ws_base.rstrip('/')}{path}"
        if query:
            encoded = urlencode({k: v for k, v in query.items() if v is not None})
            if encoded:
                url = f"{url}?{encoded}"
        return url


def _shell_quote(s: str) -> str:
    """Single-quote a string for safe shell interpolation."""
    return "'" + s.replace("'", "'\\''") + "'"
