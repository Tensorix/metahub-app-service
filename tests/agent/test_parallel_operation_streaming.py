import json

import pytest
from langchain_core.messages import AIMessage

from app.router.v1.agent_chat import StreamingCollector
from app.agent.deep_agent_service import DeepAgentService


def test_streaming_collector_handles_parallel_tools_out_of_order():
    collector = StreamingCollector()

    collector.add_operation_start(
        op_id="tool_a",
        op_type="tool",
        name="search",
        args={"q": "a"},
        started_at="2026-02-12T00:00:00+00:00",
    )
    collector.add_operation_start(
        op_id="tool_b",
        op_type="tool",
        name="read_file",
        args={"path": "README.md"},
        started_at="2026-02-12T00:00:01+00:00",
    )

    # Out-of-order completion: B first, then A.
    collector.add_operation_end(
        op_id="tool_b",
        op_type="tool",
        name="read_file",
        result="ok-b",
        success=True,
        ended_at="2026-02-12T00:00:03+00:00",
    )
    collector.add_operation_end(
        op_id="tool_a",
        op_type="tool",
        name="search",
        result="ok-a",
        success=True,
        ended_at="2026-02-12T00:00:04+00:00",
    )

    parts = collector.to_parts_data()
    tool_call_ops = [
        json.loads(p["content"])["op_id"]
        for p in parts
        if p["type"] == "tool_call"
    ]
    tool_result_ops = [
        json.loads(p["content"])["op_id"]
        for p in parts
        if p["type"] == "tool_result"
    ]

    assert set(tool_call_ops) == {"tool_a", "tool_b"}
    assert set(tool_result_ops) == {"tool_a", "tool_b"}


def test_streaming_collector_appends_metrics_part_last():
    collector = StreamingCollector()
    collector.add_text("hello")
    collector.set_metrics(
        {
            "first_token_latency_ms": 100,
            "completion_duration_ms": 200,
            "total_duration_ms": 300,
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
            "output_tokens_per_second": 25.0,
            "input_token_source": "estimated",
            "output_token_source": "estimated",
            "total_token_source": "estimated",
        }
    )

    parts = collector.to_parts_data()

    assert parts[-1]["type"] == "metrics"


@pytest.mark.asyncio
async def test_deep_agent_service_emits_operation_events_with_op_id():
    class FakeChunk:
        content = "hello"

    class FakeAgent:
        async def astream_events(self, *_args, **_kwargs):
            events = [
                {
                    "event": "on_tool_start",
                    "name": "task",
                    "run_id": "sa_1",
                    "data": {"input": {"subagent_type": "researcher", "description": "research topic"}},
                },
                {
                    "event": "on_tool_end",
                    "name": "task",
                    "run_id": "sa_1",
                    "data": {"output": "done"},
                },
                {
                    "event": "on_tool_start",
                    "name": "calculator",
                    "run_id": "tool_1",
                    "data": {"input": {"a": 1, "b": 2}},
                },
                {
                    "event": "on_tool_end",
                    "name": "calculator",
                    "run_id": "tool_1",
                    "data": {"output": "3"},
                },
                {
                    "event": "on_chat_model_stream",
                    "run_id": "msg_1",
                    "data": {"chunk": FakeChunk()},
                },
                {
                    "event": "on_chat_model_end",
                    "run_id": "msg_1",
                    "data": {
                        "output": AIMessage(
                            content="hello",
                            usage_metadata={
                                "input_tokens": 20,
                                "output_tokens": 10,
                                "total_tokens": 30,
                            },
                        )
                    },
                },
            ]
            for event in events:
                yield event

    service = DeepAgentService({"model": "gpt-4o-mini", "model_provider": "openai"})
    async def fake_get_agent():
        return FakeAgent()
    service._get_agent = fake_get_agent  # type: ignore[method-assign]

    output_events = []
    async for event in service.chat_stream("hi", thread_id="thread-1"):
        output_events.append(event)

    names = [e["event"] for e in output_events]
    assert "operation_start" in names
    assert "operation_end" in names
    assert "message" in names
    assert "metrics" in names
    assert "done" in names

    op_events = [e for e in output_events if e["event"] in {"operation_start", "operation_end"}]
    for event in op_events:
        assert event["data"].get("op_id")
        assert event["data"].get("op_type") in {"tool", "subagent"}

    metrics_event = next(e for e in output_events if e["event"] == "metrics")
    assert metrics_event["data"]["input_tokens"] == 20
    assert metrics_event["data"]["output_tokens"] == 10
    assert metrics_event["data"]["total_token_source"] == "reported"
