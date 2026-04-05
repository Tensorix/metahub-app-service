"""
Sandbox tools — execute commands and manage files in a cloud sandbox.

Available tools (registered under category "sandbox"):
- sandbox_execute: Run a shell command
- sandbox_read_file: Read a file from the sandbox
- sandbox_write_file: Write/create a file in the sandbox
- sandbox_install: Install a package (apt/pip)
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Awaitable, Callable, Optional
from uuid import UUID

from app.agent.tools.context import agent_session_id
from app.agent.tools.registry import ToolRegistry
from app.db.session import SessionLocal
from app.service.sandbox import SandboxService

def _run_async(awaitable_factory: Callable[[], Awaitable]):
    """Run async code safely from sync tool context, including worker threads."""

    def _run_in_fresh_loop():
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(awaitable_factory())
        finally:
            loop.close()
            asyncio.set_event_loop(None)

    try:
        # If this fails, there is no active loop in current thread.
        asyncio.get_running_loop()
    except RuntimeError:
        return _run_in_fresh_loop()

    # If we are already inside a running loop, execute in an isolated thread.
    with ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(_run_in_fresh_loop).result()


def _get_sandbox_id() -> Optional[str]:
    """Look up the running sandbox for the current session."""
    session_id = agent_session_id.get()
    if session_id is None:
        return None
    with SessionLocal() as db:
        return SandboxService.get_active_sandbox_id(db, session_id)


def _get_client():
    """Build a SandboxClient from current system config."""
    from app.db.session import SessionLocal
    from app.sandbox import get_sandbox_client
    from app.service.system_config import get_sandbox_config

    with SessionLocal() as db:
        cfg = get_sandbox_config(db)
    return get_sandbox_client(cfg)


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
