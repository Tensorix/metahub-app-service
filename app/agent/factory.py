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
            # Ensure connection pool exists BEFORE acquiring lock
            # This avoids deadlock since get_checkpointer also uses cls._lock
            if cls._connection_pool is None:
                await cls.get_checkpointer()  # This will create the pool
            
            async with cls._lock:
                if cls._store is None:
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
            # 清除 MCP 工具缓存
            from app.agent.mcp import get_mcp_client_manager

            get_mcp_client_manager().invalidate_cache(agent_id)
        else:
            cls._agents.clear()
            from app.agent.mcp import get_mcp_client_manager

            get_mcp_client_manager().clear_cache()

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
        
        SubAgent 现在是完整的 Agent，拥有所有 Agent 能力。

        Args:
            agent: Agent ORM model instance

        Returns:
            Configuration dictionary for DeepAgentService
        """
        agent_config = {
            "_agent_id": agent.id,  # 用于 MCP 缓存 key
            "name": agent.name,
            "description": agent.description,
            "model": agent.model,
            "model_provider": agent.model_provider,
            "system_prompt": agent.system_prompt,
            "temperature": agent.temperature,
            "max_tokens": agent.max_tokens,
            "tools": agent.tools or [],
        }

        # --- SubAgent 配置：从关联表读取完整 Agent 信息 ---
        if agent.mounted_subagents:
            agent_config["subagents"] = [
                cls._build_subagent_config(mount)
                for mount in agent.mounted_subagents
                if not mount.child_agent.is_deleted
            ]

        # Add skills from database field
        if agent.skills:
            agent_config["skills"] = agent.skills

        # Add memory files from database field
        if agent.memory_files:
            agent_config["memory"] = agent.memory_files

        # Add summarization config
        if agent.summarization_config:
            agent_config["summarization"] = agent.summarization_config

        # Add MCP Servers configuration
        if agent.mcp_servers:
            agent_config["mcp_servers"] = [
                {
                    "name": ms.name,
                    "transport": ms.transport,
                    "url": ms.url,
                    "headers": ms.headers,
                    "is_enabled": ms.is_enabled,
                }
                for ms in agent.mcp_servers
                if not ms.is_deleted
            ]

        return agent_config

    @classmethod
    def _build_subagent_config(cls, mount: "AgentSubagent") -> dict[str, Any]:
        """从关联记录 + 子 Agent 构建 SubAgent 运行时配置。

        关键改进：SubAgent 现在拥有完整的 Agent 能力：
        - model_provider：可以使用不同的 LLM 提供商
        - temperature / max_tokens：独立的推理参数
        - mcp_servers：独立的 MCP 工具集
        - skills / memory_files：独立的知识库
        """
        from app.db.model.agent_subagent import AgentSubagent
        
        child = mount.child_agent

        config = {
            "_agent_id": child.id,  # 用于 MCP 工具缓存
            "name": child.name,
            # mount_description 优先，其次 child.description
            "description": mount.mount_description or child.description or "",
            "system_prompt": child.system_prompt or "",
            "model": child.model,
            "model_provider": child.model_provider,
            "temperature": child.temperature,
            "max_tokens": child.max_tokens,
            "tools": child.tools or [],
        }

        # ✅ 新增：SubAgent 的 MCP Servers
        if child.mcp_servers:
            config["mcp_servers"] = [
                {
                    "name": ms.name,
                    "transport": ms.transport,
                    "url": ms.url,
                    "headers": ms.headers,
                    "is_enabled": ms.is_enabled,
                }
                for ms in child.mcp_servers
                if not ms.is_deleted
            ]

        # ✅ 新增：SubAgent 的 Skills
        if child.skills:
            config["skills"] = child.skills

        # ✅ 新增：SubAgent 的 Memory
        if child.memory_files:
            config["memory"] = child.memory_files

        return config

    @classmethod
    def clear_cache_cascade(cls, agent_id: UUID, db):
        """清除 Agent 缓存，并级联清除所有父 Agent 的缓存。

        当 Agent 被修改时，所有将其作为 SubAgent 的父 Agent
        也需要清除缓存，因为运行时配置已经过期。
        """
        from app.db.model.agent_subagent import AgentSubagent
        
        # 清除自身缓存
        cls.clear_cache(agent_id)

        # 查找所有将此 Agent 作为 SubAgent 的父 Agent
        parent_mounts = db.query(AgentSubagent.parent_agent_id).filter(
            AgentSubagent.child_agent_id == agent_id,
        ).all()

        for (parent_id,) in parent_mounts:
            cls.clear_cache(parent_id)
