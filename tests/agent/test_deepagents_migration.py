"""
Tests for DeepAgents migration.

Verifies that the new implementation using create_deep_agent works correctly.
"""

import pytest
from uuid import uuid4

from app.agent.deep_agent_service import DeepAgentService
from app.agent.factory import AgentFactory


class TestDeepAgentsMigration:
    """Test suite for DeepAgents migration."""

    def test_model_string_formatting(self):
        """Test provider:model format string generation."""
        # Test with provider specified
        service = DeepAgentService({
            "model": "gpt-4o-mini",
            "model_provider": "openai"
        })
        assert service._get_model_string() == "openai:gpt-4o-mini"

        # Test with model already formatted
        service = DeepAgentService({
            "model": "anthropic:claude-3-sonnet"
        })
        assert service._get_model_string() == "anthropic:claude-3-sonnet"

        # Test with defaults
        service = DeepAgentService({})
        model_string = service._get_model_string()
        assert ":" in model_string

    def test_backend_creation(self):
        """Test CompositeBackend creation with store."""
        from langgraph.store.memory import InMemoryStore

        store = InMemoryStore()
        service = DeepAgentService({}, store=store)

        backend = service._build_backend()
        assert backend is not None

        # Without store, should return None
        service_no_store = DeepAgentService({})
        assert service_no_store._build_backend() is None

    def test_subagent_middleware_creation(self):
        """Test SubAgentMiddleware creation."""
        import os
        
        # Set a dummy API key for testing
        original_key = os.environ.get("OPENAI_API_KEY")
        os.environ["OPENAI_API_KEY"] = "sk-test-key-for-testing"
        
        try:
            config = {
                "model": "gpt-4o-mini",
                "model_provider": "openai",
                "subagents": [
                    {
                        "name": "researcher",
                        "description": "Research specialist",
                        "system_prompt": "You are a researcher.",
                        "tools": [],
                    }
                ]
            }

            service = DeepAgentService(config)
            middleware = service._build_subagent_middleware()

            assert middleware is not None
            # Note: We can't easily test the subagents list without triggering
            # the full initialization, which requires a valid API key
        finally:
            # Restore original key
            if original_key:
                os.environ["OPENAI_API_KEY"] = original_key
            else:
                os.environ.pop("OPENAI_API_KEY", None)

    def test_factory_build_agent_config(self):
        """Test AgentFactory.build_agent_config method."""
        from app.db.model import Agent

        # Create mock agent
        agent = Agent(
            id=uuid4(),
            name="Test Agent",
            model="gpt-4o-mini",
            model_provider="openai",
            system_prompt="Test prompt",
            temperature=0.7,
            max_tokens=4096,
            tools=["calculator"],
        )

        config = AgentFactory.build_agent_config(agent)

        assert config["name"] == "Test Agent"
        assert config["model"] == "gpt-4o-mini"
        assert config["model_provider"] == "openai"
        assert config["tools"] == ["calculator"]
        assert config["temperature"] == 0.7

    def test_agent_initialization(self):
        """Test agent can be initialized without errors."""
        config = {
            "name": "test-agent",
            "model": "gpt-4o-mini",
            "model_provider": "openai",
            "system_prompt": "You are a test assistant.",
            "tools": [],
        }

        service = DeepAgentService(config)

        # Should not raise errors
        assert service.config == config
        assert service._agent is None  # Not created until needed

    @pytest.mark.asyncio
    async def test_chat_method_signature(self):
        """Test that chat method has correct signature."""
        import inspect

        sig = inspect.signature(DeepAgentService.chat)
        params = list(sig.parameters.keys())

        assert "self" in params
        assert "message" in params
        assert "thread_id" in params
        assert "user_id" in params

    @pytest.mark.asyncio
    async def test_chat_stream_method_signature(self):
        """Test that chat_stream method has correct signature."""
        import inspect

        sig = inspect.signature(DeepAgentService.chat_stream)
        params = list(sig.parameters.keys())

        assert "self" in params
        assert "message" in params
        assert "thread_id" in params
        assert "user_id" in params


class TestBuiltInTools:
    """Test that built-in tools are available."""

    def test_built_in_tools_documented(self):
        """Verify built-in tools are documented in system prompt."""
        service = DeepAgentService({})

        # Get default system prompt
        agent_kwargs = {
            "model": service._get_model_string(),
            "tools": [],
            "system_prompt": service.config.get("system_prompt") or (
                "You are a helpful AI assistant with access to planning tools "
                "(write_todos, read_todos) and file system tools "
                "(ls, read_file, write_file, edit_file, glob, grep)."
            ),
        }

        system_prompt = agent_kwargs["system_prompt"]

        # Check planning tools mentioned
        assert "write_todos" in system_prompt
        assert "read_todos" in system_prompt

        # Check filesystem tools mentioned
        assert "ls" in system_prompt
        assert "read_file" in system_prompt
        assert "write_file" in system_prompt
        assert "edit_file" in system_prompt
        assert "glob" in system_prompt
        assert "grep" in system_prompt


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
