"""
Agent Factory - Factory for creating and managing agent instances.

Provides:
- Agent instance creation with configuration
- Checkpointer management
- Agent caching and lifecycle
"""

from typing import Any, Optional, TYPE_CHECKING
from uuid import UUID
import asyncio

from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore

from app.config import config
from app.agent.deep_agent_service import DeepAgentService

if TYPE_CHECKING:
    from app.db.model import Agent


class AgentFactory:
    """Factory for creating and managing agent instances."""

    _checkpointer: Optional[AsyncPostgresSaver] = None
    _connection_pool: Optional[AsyncConnectionPool] = None
    _store: Optional[AsyncPostgresStore] = None
    _agents: dict[str, DeepAgentService] = {}
    _lock = asyncio.Lock()

    @classmethod
    async def get_checkpointer(cls) -> AsyncPostgresSaver:
        """
        Get or create the PostgreSQL checkpointer.

        Returns:
            AsyncPostgresSaver instance
        """
        if cls._checkpointer is None:
            async with cls._lock:
                if cls._checkpointer is None:
                    # Create connection pool
                    # Convert SQLAlchemy URI to psycopg connection string
                    # postgresql+psycopg://user:pass@host:port/db -> postgresql://user:pass@host:port/db
                    conn_string = config.sqlalchemy_database_uri.replace(
                        "postgresql+psycopg://", "postgresql://"
                    )
                    
                    # Create connection pool with open=False to avoid deprecated warning
                    cls._connection_pool = AsyncConnectionPool(
                        conninfo=conn_string,
                        min_size=1,
                        max_size=10,
                        open=False,  # Don't open in constructor
                        kwargs={
                            "autocommit": True,
                            "row_factory": dict_row,
                        }
                    )
                    
                    # Open the pool explicitly
                    await cls._connection_pool.open()
                    
                    # Create checkpointer with connection pool
                    cls._checkpointer = AsyncPostgresSaver(cls._connection_pool)
                    await cls._checkpointer.setup()
        return cls._checkpointer

    @classmethod
    async def get_store(cls) -> AsyncPostgresStore:
        """
        Get or create the PostgreSQL store for persistent memory.

        Returns:
            AsyncPostgresStore instance
        """
        if cls._store is None:
            async with cls._lock:
                if cls._store is None:
                    # Ensure connection pool exists
                    if cls._connection_pool is None:
                        await cls.get_checkpointer()  # This will create the pool
                    
                    # AsyncPostgresStore accepts connection pool (same as AsyncPostgresSaver)
                    cls._store = AsyncPostgresStore(cls._connection_pool)
                    await cls._store.setup()
        return cls._store

    @classmethod
    async def create_agent(
        cls,
        agent_id: UUID,
        agent_config: dict[str, Any],
        use_checkpointer: bool = True,
        use_store: bool = True,
    ) -> DeepAgentService:
        """
        Create a new agent service instance.

        Args:
            agent_id: Unique agent identifier
            agent_config: Agent configuration from AgentFactory.build_agent_config()
            use_checkpointer: Whether to use PostgreSQL checkpointer
            use_store: Whether to use PostgreSQL store

        Returns:
            DeepAgentService instance
        """
        cache_key = str(agent_id)

        # Check cache
        if cache_key in cls._agents:
            return cls._agents[cache_key]

        # Get dependencies
        checkpointer = await cls.get_checkpointer() if use_checkpointer else None
        store = await cls.get_store() if use_store else None

        # Create agent service
        agent_service = DeepAgentService(
            agent_config=agent_config,
            checkpointer=checkpointer,
            store=store,
        )

        # Cache agent
        cls._agents[cache_key] = agent_service

        return agent_service

    @classmethod
    async def get_agent(
        cls,
        agent_id: UUID,
        agent_config: dict[str, Any],
    ) -> DeepAgentService:
        """
        Get an existing agent or create a new one.

        Args:
            agent_id: Unique agent identifier
            agent_config: Agent configuration

        Returns:
            DeepAgentService instance
        """
        return await cls.create_agent(agent_id, agent_config)

    @classmethod
    def clear_cache(cls, agent_id: Optional[UUID] = None):
        """
        Clear agent cache.

        Args:
            agent_id: Specific agent to clear, or None to clear all
        """
        if agent_id:
            cache_key = str(agent_id)
            if cache_key in cls._agents:
                del cls._agents[cache_key]
        else:
            cls._agents.clear()

    @classmethod
    async def shutdown(cls):
        """
        Shutdown factory and cleanup resources.
        """
        cls._agents.clear()
        if cls._connection_pool:
            await cls._connection_pool.close()
            cls._connection_pool = None
        cls._checkpointer = None
        cls._store = None

    @classmethod
    def build_agent_config(cls, agent: "Agent") -> dict[str, Any]:
        """
        Build agent config dict from ORM model.

        Args:
            agent: Agent ORM model instance

        Returns:
            Configuration dictionary for DeepAgentService
        """
        agent_config = {
            "name": agent.name,
            "model": agent.model,
            "model_provider": agent.model_provider,
            "system_prompt": agent.system_prompt,
            "temperature": agent.temperature,
            "max_tokens": agent.max_tokens,
            "tools": agent.tools or [],
        }

        # Add subagents if available
        if agent.subagents:
            agent_config["subagents"] = [
                {
                    "name": sa.name,
                    "description": sa.description,
                    "system_prompt": sa.system_prompt,
                    "model": sa.model,
                    "tools": sa.tools or [],
                }
                for sa in agent.subagents
                if not sa.is_deleted
            ]

        # Add skills from database field
        if agent.skills:
            agent_config["skills"] = agent.skills

        # Add memory files from database field
        if agent.memory_files:
            agent_config["memory"] = agent.memory_files

        return agent_config
