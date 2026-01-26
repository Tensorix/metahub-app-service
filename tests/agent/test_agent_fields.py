"""
Tests for Agent skills and memory_files fields.
"""

import pytest
from uuid import uuid4

from app.db.model.agent import Agent
from app.agent.factory import AgentFactory


class TestAgentFields:
    """Test suite for Agent skills and memory_files fields."""

    def test_agent_with_skills_field(self):
        """Test Agent with skills field."""
        agent = Agent(
            id=uuid4(),
            name="Test Agent",
            model="gpt-4o-mini",
            model_provider="openai",
            system_prompt="Test prompt",
            temperature=0.7,
            max_tokens=4096,
            tools=["calculator"],
            skills=["./skills/research/", "./skills/coding/"],
        )

        assert agent.skills == ["./skills/research/", "./skills/coding/"]

    def test_agent_with_memory_files_field(self):
        """Test Agent with memory_files field."""
        agent = Agent(
            id=uuid4(),
            name="Test Agent",
            model="gpt-4o-mini",
            model_provider="openai",
            system_prompt="Test prompt",
            temperature=0.7,
            max_tokens=4096,
            tools=["calculator"],
            memory_files=["./AGENTS.md", "~/.deepagents/AGENTS.md"],
        )

        assert agent.memory_files == ["./AGENTS.md", "~/.deepagents/AGENTS.md"]

    def test_build_agent_config_with_skills(self):
        """Test AgentFactory.build_agent_config includes skills."""
        agent = Agent(
            id=uuid4(),
            name="Test Agent",
            model="gpt-4o-mini",
            model_provider="openai",
            system_prompt="Test prompt",
            temperature=0.7,
            max_tokens=4096,
            tools=["calculator"],
            skills=["./skills/research/"],
        )

        config = AgentFactory.build_agent_config(agent)

        assert "skills" in config
        assert config["skills"] == ["./skills/research/"]

    def test_build_agent_config_with_memory_files(self):
        """Test AgentFactory.build_agent_config includes memory files."""
        agent = Agent(
            id=uuid4(),
            name="Test Agent",
            model="gpt-4o-mini",
            model_provider="openai",
            system_prompt="Test prompt",
            temperature=0.7,
            max_tokens=4096,
            tools=["calculator"],
            memory_files=["./AGENTS.md"],
        )

        config = AgentFactory.build_agent_config(agent)

        assert "memory" in config
        assert config["memory"] == ["./AGENTS.md"]

    def test_build_agent_config_without_skills_and_memory(self):
        """Test AgentFactory.build_agent_config without skills and memory."""
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

        # Should not have skills or memory keys if not set
        assert "skills" not in config
        assert "memory" not in config

    def test_build_agent_config_complete(self):
        """Test AgentFactory.build_agent_config with all fields."""
        agent = Agent(
            id=uuid4(),
            name="Complete Agent",
            model="gpt-4o",
            model_provider="openai",
            system_prompt="You are a complete agent.",
            temperature=0.8,
            max_tokens=8192,
            tools=["calculator", "search"],
            skills=["./skills/research/", "./skills/coding/"],
            memory_files=["./AGENTS.md", "~/.deepagents/AGENTS.md"],
        )

        config = AgentFactory.build_agent_config(agent)

        assert config["name"] == "Complete Agent"
        assert config["model"] == "gpt-4o"
        assert config["model_provider"] == "openai"
        assert config["system_prompt"] == "You are a complete agent."
        assert config["temperature"] == 0.8
        assert config["max_tokens"] == 8192
        assert config["tools"] == ["calculator", "search"]
        assert config["skills"] == ["./skills/research/", "./skills/coding/"]
        assert config["memory"] == ["./AGENTS.md", "~/.deepagents/AGENTS.md"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
