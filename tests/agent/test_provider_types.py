from uuid import uuid4

from app.agent.factory import AgentFactory
from app.agent.llm_factory import build_chat_model
from app.agent.message_analyzer import MessageAnalyzer
from app.agent.runtime.builder import AgentBuilder
from app.db.model.agent import Agent
from app.schema.system_config import ProviderConfig
from app.service import system_config as system_config_service


class _BootstrapStub:
    skills_source_paths: list[str] = []
    mounted_files: dict[str, dict] = {}


def test_builder_preserves_prefixed_model_string():
    builder = AgentBuilder(
        agent_config={"model": "anthropic:claude-3-sonnet"},
        bootstrap_provider=_BootstrapStub(),
    )

    assert builder._get_model_string() == "anthropic:claude-3-sonnet"


def test_resolve_provider_returns_provider_type(monkeypatch):
    monkeypatch.setattr(
        system_config_service,
        "get_providers",
        lambda _db: {
            "openrouter-main": ProviderConfig(
                name="OpenRouter",
                api_base_url="https://openrouter.ai/api/v1",
                api_key="sk-or-test",
                provider_type="openrouter",
            )
        },
    )

    assert system_config_service.resolve_provider(object(), "openrouter-main") == (
        "https://openrouter.ai/api/v1",
        "sk-or-test",
        "openrouter",
    )


def test_agent_factory_stores_resolved_provider_type(monkeypatch):
    monkeypatch.setattr(
        system_config_service,
        "resolve_provider",
        lambda _db, _provider_id: (
            "https://openrouter.ai/api/v1",
            "sk-or-test",
            "openrouter",
        ),
    )

    agent = Agent(
        id=uuid4(),
        name="OpenRouter Agent",
        model="openai/gpt-4.1-mini",
        model_provider="openrouter-main",
        tools=[],
    )

    config = AgentFactory.build_agent_config(agent, db=object())

    assert config["_resolved_provider_type"] == "openrouter"
    assert config["_resolved_base_url"] == "https://openrouter.ai/api/v1"
    assert "_resolved_sdk" not in config


def test_message_analyzer_uses_provider_type(monkeypatch):
    captured: dict = {}

    def fake_build_chat_model(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr("app.agent.message_analyzer.build_chat_model", fake_build_chat_model)

    analyzer = MessageAnalyzer(
        model_name="openai/gpt-4.1-mini",
        provider_type="openrouter",
        api_base_url="https://openrouter.ai/api/v1",
        api_key="sk-or-test",
    )

    assert analyzer.llm is not None
    assert captured["provider_type"] == "openrouter"
    assert captured["model"] == "openai/gpt-4.1-mini"
    assert captured["base_url"] == "https://openrouter.ai/api/v1"


def test_normalize_provider_registry_preserves_existing_api_key():
    incoming = {
        "openrouter-main": {
            "name": "OpenRouter",
            "api_base_url": "https://openrouter.ai/api/v1",
            "api_key": None,
            "provider_type": "openrouter",
        }
    }
    existing = {
        "openrouter-main": {
            "name": "OpenRouter",
            "api_base_url": "https://openrouter.ai/api/v1",
            "api_key": "sk-or-real",
            "provider_type": "openrouter",
        }
    }

    normalized = system_config_service.normalize_provider_registry(incoming, existing)

    assert normalized["openrouter-main"]["api_key"] == "sk-or-real"


async def test_fetch_upstream_models_does_not_use_openai_fallback_for_openrouter(monkeypatch):
    captured: dict = {}

    class _Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"id": "openai/gpt-4.1-mini"}]}

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, headers=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            return _Response()

    monkeypatch.setattr(system_config_service.httpx, "AsyncClient", lambda timeout=15.0: _Client())
    monkeypatch.setattr(system_config_service.config, "OPENAI_API_KEY", "sk-openai-env")

    models = await system_config_service.fetch_upstream_models(
        "https://openrouter.ai/api/v1",
        None,
        provider_type="openrouter",
    )

    assert models[0].id == "openai/gpt-4.1-mini"
    assert "Authorization" not in captured["headers"]


def test_builder_generation_params_cast_max_tokens_to_int():
    builder = AgentBuilder(
        agent_config={"temperature": 0, "max_tokens": 4096.0},
        bootstrap_provider=_BootstrapStub(),
    )

    kwargs = builder._apply_generation_params({}, {"temperature": 0, "max_tokens": 4096.0})

    assert kwargs["temperature"] == 0.0
    assert kwargs["max_tokens"] == 4096
    assert isinstance(kwargs["max_tokens"], int)


def test_llm_factory_omits_max_tokens_for_openrouter(monkeypatch):
    captured: dict = {}

    class _FakeChatOpenRouter:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr("langchain_openrouter.ChatOpenRouter", _FakeChatOpenRouter)

    build_chat_model(
        provider_type="openrouter",
        model="openai/gpt-4.1-mini",
        api_key="sk-test",
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
        max_tokens=4096.0,
    )

    assert captured["temperature"] == 0.0
    assert "max_tokens" not in captured
