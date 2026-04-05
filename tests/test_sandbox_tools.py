import threading

from app.agent.tools.builtin import sandbox_tools


class _FakeSandboxClient:
    async def run_command(self, _sandbox_id: str, _command: str) -> dict[str, object]:
        return {
            "exit_code": 0,
            "stdout": "ok",
            "stderr": "",
        }


def test_sandbox_execute_works_in_thread_without_event_loop(monkeypatch):
    monkeypatch.setattr(sandbox_tools, "_get_sandbox_id", lambda: "sandbox-123")
    monkeypatch.setattr(sandbox_tools, "_get_client", lambda: _FakeSandboxClient())

    result_holder: dict[str, str] = {}
    error_holder: dict[str, str] = {}

    execute_fn = getattr(sandbox_tools.sandbox_execute, "func", sandbox_tools.sandbox_execute)

    def _worker() -> None:
        try:
            result_holder["output"] = execute_fn("echo ok")
        except Exception as exc:  # pragma: no cover - defensive guard for thread debug
            error_holder["error"] = str(exc)

    thread = threading.Thread(target=_worker, name="sandbox-tool-thread")
    thread.start()
    thread.join(timeout=5)

    assert "error" not in error_holder
    assert "output" in result_holder
    output = result_holder["output"]
    assert "exit_code: 0" in output
    assert "stdout:\nok" in output
    assert "there is no current event loop in thread" not in output.lower()
