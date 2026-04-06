"""
Sandbox tools — execute commands and manage files in a cloud sandbox.

Available tools (registered under category "sandbox"):
- sandbox_execute: Run a shell command
- sandbox_read_file: Read a file from the sandbox
- sandbox_write_file: Write/create a file in the sandbox
- sandbox_install: Install a package (apt/pip)
"""

import asyncio
import threading
from typing import Awaitable, Callable, Optional

from app.agent.tools.context import agent_session_id
from app.agent.tools.registry import ToolRegistry
from app.db.session import SessionLocal
from app.service.sandbox import SandboxService

# ---------------------------------------------------------------------------
# Persistent event loop for tool-path async operations.
#
# Why: Sandbox SDK objects (Sandbox, httpx transport, httpcore pool) contain
# asyncio primitives (Event, Lock) that are bound to the loop they were
# first used on.  Creating a fresh loop per tool call means cached SDK
# handles become invalid immediately, causing "Event … bound to a different
# event loop" and "list.remove(x): x not in list" errors.
#
# A dedicated long-lived loop ensures all tool-path SDK objects stay on the
# same loop for the lifetime of the process.
# ---------------------------------------------------------------------------
_tool_loop: asyncio.AbstractEventLoop | None = None
_tool_loop_thread: threading.Thread | None = None
_tool_loop_lock = threading.Lock()

# Separate SandboxClient for tools — NOT the global singleton used by
# FastAPI router/service.  Sharing handles across different event loops
# (FastAPI loop vs tool loop) is the root cause of the errors.
_tool_client = None
_tool_client_config_hash: str | None = None


def _get_tool_loop() -> asyncio.AbstractEventLoop:
    """Return (or create) a persistent background event loop for tool calls."""
    global _tool_loop, _tool_loop_thread
    with _tool_loop_lock:
        if _tool_loop is not None and _tool_loop.is_running():
            return _tool_loop
        _tool_loop = asyncio.new_event_loop()
        _tool_loop_thread = threading.Thread(
            target=_tool_loop.run_forever,
            daemon=True,
            name="sandbox-tool-loop",
        )
        _tool_loop_thread.start()
        return _tool_loop


def _run_async(awaitable_factory: Callable[[], Awaitable]):
    """Run async code on the persistent tool loop from any sync context."""
    loop = _get_tool_loop()
    future = asyncio.run_coroutine_threadsafe(awaitable_factory(), loop)
    return future.result(timeout=120)


def _get_sandbox_id() -> Optional[str]:
    """Look up the running sandbox for the current session."""
    session_id = agent_session_id.get()
    if session_id is None:
        return None
    with SessionLocal() as db:
        return SandboxService.get_active_sandbox_id(db, session_id)


def _get_client():
    """Return a SandboxClient dedicated to the tool event loop.

    This is intentionally separate from the global singleton used by
    FastAPI async routes to prevent cross-event-loop handle contamination.
    """
    global _tool_client, _tool_client_config_hash

    from app.sandbox.client import SandboxClient
    from app.service.system_config import get_sandbox_config

    with SessionLocal() as db:
        cfg = get_sandbox_config(db)

    config_hash = f"{cfg.api_domain}:{cfg.api_key}"
    if _tool_client is None or _tool_client_config_hash != config_hash:
        _tool_client = SandboxClient(cfg)
        _tool_client_config_hash = config_hash

    return _tool_client


@ToolRegistry.register(
    name="sandbox_execute",
    description=(
        "Execute a shell command in the sandbox environment. "
        "Returns exit_code, stdout, and stderr. "
        "Use this for running scripts, compiling code, or executing programs."
    ),
    category="sandbox",
)
def sandbox_execute(command: str) -> str:
    """
    Execute a shell command inside the sandbox.

    Args:
        command: Shell command to run (e.g. "python script.py", "ls -la").

    Returns:
        Command output including exit code, stdout, and stderr.
    """
    sandbox_id = _get_sandbox_id()
    if not sandbox_id:
        return "Error: No active sandbox for this session."

    try:
        client = _get_client()
        result = _run_async(
            lambda: client.run_command(sandbox_id, command)
        )
        parts = [f"exit_code: {result['exit_code']}"]
        if result.get("stdout"):
            parts.append(f"stdout:\n{result['stdout']}")
        if result.get("stderr"):
            parts.append(f"stderr:\n{result['stderr']}")
        return "\n".join(parts)
    except Exception as e:
        return f"Error executing command: {e}"


@ToolRegistry.register(
    name="sandbox_read_file",
    description="Read a file from the sandbox filesystem.",
    category="sandbox",
)
def sandbox_read_file(path: str) -> str:
    """
    Read a file from the sandbox.

    Args:
        path: Absolute path inside the sandbox (e.g. "/home/user/script.py").

    Returns:
        File contents or error message.
    """
    sandbox_id = _get_sandbox_id()
    if not sandbox_id:
        return "Error: No active sandbox for this session."

    try:
        client = _get_client()
        content = _run_async(
            lambda: client.read_file(sandbox_id, path)
        )
        return content
    except Exception as e:
        return f"Error reading file: {e}"


@ToolRegistry.register(
    name="sandbox_write_file",
    description="Write or create a file in the sandbox filesystem.",
    category="sandbox",
)
def sandbox_write_file(path: str, content: str) -> str:
    """
    Write content to a file in the sandbox.

    Args:
        path: Absolute path for the file (e.g. "/home/user/script.py").
        content: File content to write.

    Returns:
        Success message or error.
    """
    sandbox_id = _get_sandbox_id()
    if not sandbox_id:
        return "Error: No active sandbox for this session."

    try:
        client = _get_client()
        _run_async(
            lambda: client.write_file(sandbox_id, path, content)
        )
        return f"File written: {path}"
    except Exception as e:
        return f"Error writing file: {e}"


@ToolRegistry.register(
    name="sandbox_install",
    description=(
        "Install a package in the sandbox. "
        "Supports apt and pip. Specify the package manager with the 'manager' argument."
    ),
    category="sandbox",
)
def sandbox_install(
    package: str,
    manager: str = "pip",
) -> str:
    """
    Install a package in the sandbox.

    Args:
        package: Package name (e.g. "numpy", "curl").
        manager: Package manager to use: "pip" or "apt" (default: "pip").

    Returns:
        Installation output or error.
    """
    sandbox_id = _get_sandbox_id()
    if not sandbox_id:
        return "Error: No active sandbox for this session."

    if manager == "pip":
        cmd = f"pip install {package}"
    elif manager == "apt":
        cmd = f"apt-get update -qq && apt-get install -y -qq {package}"
    else:
        return f"Error: Unsupported package manager: {manager}"

    try:
        client = _get_client()
        result = _run_async(
            lambda: client.run_command(sandbox_id, cmd)
        )
        parts = [f"exit_code: {result['exit_code']}"]
        if result.get("stdout"):
            stdout = result["stdout"]
            # Truncate long output
            if len(stdout) > 2000:
                stdout = stdout[:1000] + "\n... (truncated) ...\n" + stdout[-500:]
            parts.append(f"stdout:\n{stdout}")
        if result.get("stderr"):
            stderr = result["stderr"]
            if len(stderr) > 1000:
                stderr = stderr[:500] + "\n... (truncated) ...\n" + stderr[-300:]
            parts.append(f"stderr:\n{stderr}")
        return "\n".join(parts)
    except Exception as e:
        return f"Error installing package: {e}"
