from types import SimpleNamespace

import pytest

from app.agent.deep_agent_service import DeepAgentService
from app.agent.runtime.events import StreamEventTranslator


def test_chat_model_end_emits_fallback_text_when_no_stream_tokens():
    translator = StreamEventTranslator()
    event = {
        "event": "on_chat_model_end",
        "run_id": "run-1",
        "data": {
            "output": SimpleNamespace(
                generations=[
                    [
                        SimpleNamespace(
                            message=SimpleNamespace(content="final openrouter answer")
                        )
                    ]
                ]
            )
        },
    }

    translated = translator.translate_event(event)

    assert translated == [
        {"event": "message", "data": {"content": "final openrouter answer"}}
    ]


def test_chat_model_end_does_not_duplicate_text_after_stream():
    translator = StreamEventTranslator()

    stream_event = {
        "event": "on_chat_model_stream",
        "run_id": "run-2",
        "data": {"chunk": SimpleNamespace(content="hello ")},
    }
    end_event = {
        "event": "on_chat_model_end",
        "run_id": "run-2",
        "data": {
            "output": SimpleNamespace(
                generations=[
                    [
                        SimpleNamespace(
                            message=SimpleNamespace(content="hello world")
                        )
                    ]
                ]
            )
        },
    }

    translated_stream = translator.translate_event(stream_event)
    translated_end = translator.translate_event(end_event)

    assert translated_stream == [{"event": "message", "data": {"content": "hello "}}]
    assert translated_end == []


def test_chat_model_stream_emits_thinking_from_reasoning_content():
    translator = StreamEventTranslator()
    event = {
        "event": "on_chat_model_stream",
        "run_id": "run-thinking-1",
        "data": {
            "chunk": SimpleNamespace(
                content="final ",
                additional_kwargs={"reasoning_content": "step by step"},
            )
        },
    }

    translated = translator.translate_event(event)

    assert translated == [
        {"event": "thinking", "data": {"content": "step by step"}},
        {"event": "message", "data": {"content": "final "}},
    ]


def test_chat_model_end_emits_fallback_thinking_when_no_stream_reasoning():
    translator = StreamEventTranslator()
    event = {
        "event": "on_chat_model_end",
        "run_id": "run-thinking-2",
        "data": {
            "output": SimpleNamespace(
                generations=[
                    [
                        SimpleNamespace(
                            message=SimpleNamespace(
                                content="answer",
                                additional_kwargs={"reasoning_content": "hidden chain"},
                            )
                        )
                    ]
                ]
            )
        },
    }

    translated = translator.translate_event(event)

    assert translated == [
        {"event": "thinking", "data": {"content": "hidden chain"}},
        {"event": "message", "data": {"content": "answer"}},
    ]


def test_chat_model_end_does_not_duplicate_thinking_after_stream():
    translator = StreamEventTranslator()
    stream_event = {
        "event": "on_chat_model_stream",
        "run_id": "run-thinking-3",
        "data": {
            "chunk": SimpleNamespace(
                content="answer ",
                additional_kwargs={"reasoning_content": "draft"},
            )
        },
    }
    end_event = {
        "event": "on_chat_model_end",
        "run_id": "run-thinking-3",
        "data": {
            "output": SimpleNamespace(
                generations=[
                    [
                        SimpleNamespace(
                            message=SimpleNamespace(
                                content="answer done",
                                additional_kwargs={"reasoning_content": "draft"},
                            )
                        )
                    ]
                ]
            )
        },
    }

    translated_stream = translator.translate_event(stream_event)
    translated_end = translator.translate_event(end_event)

    assert translated_stream == [
        {"event": "thinking", "data": {"content": "draft"}},
        {"event": "message", "data": {"content": "answer "}},
    ]
    assert translated_end == []


@pytest.mark.asyncio
async def test_stream_request_falls_back_to_graph_state_when_no_text_events():
    service = DeepAgentService({})

    class _Agent:
        async def astream_events(self, input_data, config=None, version="v2"):
            if False:
                yield None
            return

        async def aget_state(self, cfg):
            return SimpleNamespace(
                values={
                    "messages": [
                        SimpleNamespace(type="ai", content="state fallback answer")
                    ]
                }
            )

    events = []
    async for event in service._stream_request(
        agent=_Agent(),
        input_data={"messages": [{"role": "user", "content": "hi"}]},
        cfg={"configurable": {"thread_id": "topic_test"}},
        emit_interrupt=False,
    ):
        events.append(event)

    assert {"event": "message", "data": {"content": "state fallback answer"}} in events
