from langchain_core.messages import AIMessage

from app.utils.chat_metrics import build_chat_performance_metrics, extract_usage_metadata
from app.utils.message_utils import parts_to_message_str


def test_extract_usage_metadata_from_messages_payload():
    payload = {
        "messages": [
            AIMessage(
                content="hello",
                usage_metadata={
                    "input_tokens": 12,
                    "output_tokens": 5,
                    "total_tokens": 17,
                },
            )
        ]
    }

    usage = extract_usage_metadata(payload)

    assert usage == {
        "input_tokens": 12,
        "output_tokens": 5,
        "total_tokens": 17,
    }


def test_build_chat_performance_metrics_marks_estimated_sources():
    metrics = build_chat_performance_metrics(
        request_started_at=1.0,
        first_token_at=1.2,
        completed_at=2.2,
        reported_usage=None,
        estimated_input_text="system\nuser: hello",
        estimated_output_text="assistant reply",
        model_name="gpt-4o-mini",
        provider="openai",
    )

    assert metrics["first_token_latency_ms"] == 200
    assert metrics["completion_duration_ms"] == 1000
    assert metrics["input_token_source"] == "estimated"
    assert metrics["output_token_source"] == "estimated"
    assert metrics["total_token_source"] == "estimated"
    assert metrics["total_tokens"] == metrics["input_tokens"] + metrics["output_tokens"]


def test_parts_to_message_str_ignores_metrics_parts():
    parts = [
        {"type": "text", "content": "hello"},
        {"type": "metrics", "content": '{"input_tokens":1}'},
    ]

    assert parts_to_message_str(parts) == "hello"
