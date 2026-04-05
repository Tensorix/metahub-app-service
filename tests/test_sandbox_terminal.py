from datetime import datetime, timezone
from uuid import uuid4

import pytest
from opensandbox.models.sandboxes import SandboxEndpoint

from app.db.model.session import Session as SessionModel
from app.db.model.session_sandbox import SessionSandbox
from app.sandbox.client import SandboxClient
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
