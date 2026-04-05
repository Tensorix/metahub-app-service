import json
from datetime import datetime, timezone
from uuid import uuid4

import httpx
import pytest
from opensandbox.models.sandboxes import SandboxEndpoint

from app.db.model.session import Session as SessionModel
from app.db.model.session_sandbox import SessionSandbox
from app.router.v1.sandbox import _extract_terminal_error_code, _rewrite_upstream_terminal_error
from app.sandbox.client import SandboxClient, SandboxPtyUnsupportedError
from app.schema.system_config import SandboxConfigValue
from app.service.sandbox import SandboxService
import app.service.sandbox as sandbox_service_module


class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self, sandbox_record: SessionSandbox, session_record: SessionModel):
        self._sandbox_record = sandbox_record
        self._session_record = session_record
        self.commits = 0
        self.refreshes = 0

    def query(self, model):
        if model is SessionSandbox:
            return _FakeQuery(self._sandbox_record)
        if model is SessionModel:
            return _FakeQuery(self._session_record)
        raise AssertionError(f"Unexpected query model: {model!r}")

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        self.refreshes += 1


class _FakeSandboxClient:
    def __init__(self):
        self.deleted_sessions: list[tuple[str, str]] = []
        self.killed_sandboxes: list[str] = []

    async def delete_pty_session(self, sandbox_id: str, terminal_session_id: str) -> None:
        self.deleted_sessions.append((sandbox_id, terminal_session_id))

    async def kill(self, sandbox_id: str) -> None:
        self.killed_sandboxes.append(sandbox_id)


@pytest.mark.asyncio
async def test_stop_sandbox_cleans_up_terminal_session(monkeypatch):
    user_id = uuid4()
    session_id = uuid4()

    session_record = SessionModel(
        id=session_id,
        user_id=user_id,
        type="ai",
        is_deleted=False,
        agent_id=None,
    )
    sandbox_record = SessionSandbox(
        session_id=session_id,
        user_id=user_id,
        sandbox_id="sandbox-123",
        status="running",
        image="ubuntu",
        terminal_session_id="pty-123",
        terminal_session_created_at=datetime.now(timezone.utc),
        terminal_session_last_seen_at=datetime.now(timezone.utc),
    )
    db = _FakeDB(sandbox_record, session_record)
    fake_client = _FakeSandboxClient()

    monkeypatch.setattr(
        sandbox_service_module,
        "get_sandbox_config",
        lambda _db: SandboxConfigValue(enabled=True, api_domain="api.example.com", api_key="secret"),
    )
    monkeypatch.setattr(
        sandbox_service_module,
        "get_sandbox_client",
        lambda _cfg: fake_client,
    )

    record = await SandboxService.stop_sandbox(db, session_id, user_id)

    assert record.status == "stopped"
    assert record.terminal_session_id is None
    assert record.terminal_session_created_at is None
    assert record.terminal_session_last_seen_at is None
    assert fake_client.deleted_sessions == [("sandbox-123", "pty-123")]
    assert fake_client.killed_sandboxes == ["sandbox-123"]


def test_sandbox_client_builds_execd_websocket_url_and_headers():
    client = SandboxClient(
        SandboxConfigValue(
            enabled=True,
            api_domain="api.example.com",
            api_key="secret",
        )
    )
    client._config.protocol = "https"
    client._config.headers = {"X-Custom": "custom"}
    endpoint = SandboxEndpoint(
        endpoint="sandbox.example.com:44772",
        headers={"X-EXECD-ACCESS-TOKEN": "token-1"},
    )

    url = client._execd_websocket_url(
        endpoint,
        "/pty/pty-123/ws",
        {"since": 42},
    )
    headers = client._execd_headers(endpoint)

    assert url == "wss://sandbox.example.com:44772/pty/pty-123/ws?since=42"
    assert headers["X-Custom"] == "custom"
    assert headers["X-EXECD-ACCESS-TOKEN"] == "token-1"
    assert "User-Agent" in headers


@pytest.mark.asyncio
async def test_create_pty_session_preserves_endpoint_path_prefix(monkeypatch):
    client = SandboxClient(
        SandboxConfigValue(
            enabled=True,
            api_domain="api.example.com",
            api_key="secret",
        )
    )
    client._config.protocol = "https"

    endpoint = SandboxEndpoint(
        endpoint="sandbox.example.com/proxy/sbx-1/execd",
        headers={"X-EXECD-ACCESS-TOKEN": "token-1"},
    )
    captured: dict[str, object] = {}

    async def _fake_get_execd_endpoint(_sandbox_id: str) -> SandboxEndpoint:
        return endpoint

    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            captured["base_url"] = kwargs.get("base_url")

        async def __aenter__(self):
            return self

        async def __aexit__(self, _exc_type, _exc, _tb):
            return None

        async def request(self, method, path, json=None):
            captured["method"] = method
            captured["path"] = path
            captured["json"] = json
            request = httpx.Request(
                method,
                "https://sandbox.example.com/proxy/sbx-1/execd/pty",
            )
            return httpx.Response(
                status_code=200,
                request=request,
                json={"session_id": "pty-1"},
            )

    monkeypatch.setattr(client, "_get_execd_endpoint", _fake_get_execd_endpoint)
    monkeypatch.setattr("app.sandbox.client.httpx.AsyncClient", _FakeAsyncClient)

    session_id = await client.create_pty_session("sandbox-123", cwd="/workspace")

    assert session_id == "pty-1"
    assert captured["base_url"] == "https://sandbox.example.com/proxy/sbx-1/execd/"
    assert captured["path"] == "pty"
    assert captured["json"] == {"cwd": "/workspace"}


@pytest.mark.asyncio
async def test_create_pty_session_raises_unsupported_on_404(monkeypatch):
    client = SandboxClient(
        SandboxConfigValue(
            enabled=True,
            api_domain="api.example.com",
            api_key="secret",
        )
    )
    endpoint = SandboxEndpoint(
        endpoint="sandbox.example.com/proxy/sbx-1/execd",
        headers={},
    )

    async def _fake_get_execd_endpoint(_sandbox_id: str) -> SandboxEndpoint:
        return endpoint

    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, _exc_type, _exc, _tb):
            return None

        async def request(self, method, path, json=None):
            request = httpx.Request(method, f"https://sandbox.example.com/proxy/sbx-1/execd/{path}")
            return httpx.Response(status_code=404, request=request, text="404 page not found")

    monkeypatch.setattr(client, "_get_execd_endpoint", _fake_get_execd_endpoint)
    monkeypatch.setattr("app.sandbox.client.httpx.AsyncClient", _FakeAsyncClient)

    with pytest.raises(SandboxPtyUnsupportedError):
        await client.create_pty_session("sandbox-123", cwd="/workspace")


@pytest.mark.asyncio
async def test_connect_pty_websocket_supports_pipe_mode_query(monkeypatch):
    client = SandboxClient(
        SandboxConfigValue(
            enabled=True,
            api_domain="api.example.com",
            api_key="secret",
        )
    )
    endpoint = SandboxEndpoint(
        endpoint="sandbox.example.com:44772",
        headers={},
    )

    async def _fake_get_execd_endpoint(_sandbox_id: str) -> SandboxEndpoint:
        return endpoint

    captured: dict[str, object] = {}

    class _DummyWs:
        async def close(self):
            return None

    async def _fake_ws_connect(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return _DummyWs()

    monkeypatch.setattr(client, "_get_execd_endpoint", _fake_get_execd_endpoint)
    monkeypatch.setattr("app.sandbox.client.websockets.connect", _fake_ws_connect)

    await client.connect_pty_websocket(
        "sandbox-123",
        "pty-1",
        since=0,
        pty=False,
    )

    assert captured["url"] == "wss://sandbox.example.com:44772/pty/pty-1/ws?since=0&pty=0"


@pytest.mark.asyncio
async def test_resolve_pty_cwd_prefers_workspace(monkeypatch):
    client = SandboxClient(
        SandboxConfigValue(
            enabled=True,
            api_domain="api.example.com",
            api_key="secret",
        )
    )

    captured: dict[str, str] = {}

    async def _fake_run_command(_sandbox_id: str, command: str):
        captured["command"] = command
        return {"exit_code": 0, "stdout": "/workspace", "stderr": ""}

    monkeypatch.setattr(client, "run_command", _fake_run_command)

    cwd = await client.resolve_pty_cwd("sandbox-123", preferred="/workspace")

    assert cwd == "/workspace"
    assert "-d '/workspace'" in captured["command"]


@pytest.mark.asyncio
async def test_resolve_pty_cwd_returns_none_on_invalid_output(monkeypatch):
    client = SandboxClient(
        SandboxConfigValue(
            enabled=True,
            api_domain="api.example.com",
            api_key="secret",
        )
    )

    async def _fake_run_command(_sandbox_id: str, _command: str):
        return {"exit_code": 0, "stdout": "relative/path", "stderr": ""}

    monkeypatch.setattr(client, "run_command", _fake_run_command)

    cwd = await client.resolve_pty_cwd("sandbox-123", preferred="/workspace")

    assert cwd is None


def test_rewrite_upstream_terminal_error_for_missing_bash():
    raw = json.dumps(
        {
            "type": "error",
            "error": "pty.StartWithSize: fork/exec /usr/bin/bash: no such file or directory",
        }
    )

    rewritten = _rewrite_upstream_terminal_error(raw)

    assert rewritten is not None
    payload = json.loads(rewritten)
    assert payload["type"] == "error"
    assert payload["code"] == "PTY_BASH_START_FAILED"
    assert "failed to start bash" in payload["error"].lower()
    assert "pty.StartWithSize" in payload["details"]


def test_rewrite_upstream_terminal_error_ignores_other_messages():
    raw = json.dumps({"type": "connected", "mode": "pty"})

    rewritten = _rewrite_upstream_terminal_error(raw)

    assert rewritten is None


def test_extract_terminal_error_code_from_error_frame():
    raw = json.dumps({"type": "error", "code": "PTY_BASH_START_FAILED", "error": "x"})

    code = _extract_terminal_error_code(raw)

    assert code == "PTY_BASH_START_FAILED"


def test_extract_terminal_error_code_returns_none_for_non_error_frames():
    raw = json.dumps({"type": "connected", "mode": "pty"})

    code = _extract_terminal_error_code(raw)

    assert code is None
