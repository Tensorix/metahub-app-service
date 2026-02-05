"""
MCP Server CRUD Service.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.model.agent import Agent
from app.db.model.agent_mcp_server import AgentMcpServer
from app.schema.mcp_server import McpServerCreate, McpServerUpdate
from app.agent.factory import AgentFactory
from app.config import config


class McpServerService:
    """MCP Server 管理服务."""

    @staticmethod
    def list_by_agent(
        db: Session,
        agent_id: UUID,
    ) -> list[AgentMcpServer]:
        """列出 Agent 的所有 MCP Server 配置."""
        return (
            db.query(AgentMcpServer)
            .filter(
                AgentMcpServer.agent_id == agent_id,
                AgentMcpServer.is_deleted == False,
            )
            .order_by(AgentMcpServer.sort_order, AgentMcpServer.created_at)
            .all()
        )

    @staticmethod
    def get(
        db: Session,
        server_id: UUID,
        agent_id: UUID,
    ) -> Optional[AgentMcpServer]:
        """获取单个 MCP Server 配置."""
        return (
            db.query(AgentMcpServer)
            .filter(
                AgentMcpServer.id == server_id,
                AgentMcpServer.agent_id == agent_id,
                AgentMcpServer.is_deleted == False,
            )
            .first()
        )

    @staticmethod
    def create(
        db: Session,
        agent_id: UUID,
        data: McpServerCreate,
    ) -> AgentMcpServer:
        """
        创建 MCP Server 配置.

        创建后清除 Agent 缓存，下次对话时会重新加载工具。
        """
        # 检查数量限制
        count = (
            db.query(AgentMcpServer)
            .filter(
                AgentMcpServer.agent_id == agent_id,
                AgentMcpServer.is_deleted == False,
            )
            .count()
        )
        if count >= config.MCP_MAX_SERVERS_PER_AGENT:
            raise ValueError(
                f"Maximum {config.MCP_MAX_SERVERS_PER_AGENT} "
                f"MCP servers per agent"
            )

        server = AgentMcpServer(
            agent_id=agent_id,
            name=data.name,
            description=data.description,
            transport=data.transport,
            url=data.url,
            headers=data.headers,
            is_enabled=data.is_enabled,
            sort_order=data.sort_order,
        )
        db.add(server)
        db.commit()
        db.refresh(server)

        # 清除 Agent 缓存
        AgentFactory.clear_cache(agent_id)

        return server

    @staticmethod
    def update(
        db: Session,
        server_id: UUID,
        agent_id: UUID,
        data: McpServerUpdate,
    ) -> Optional[AgentMcpServer]:
        """更新 MCP Server 配置."""
        server = McpServerService.get(db, server_id, agent_id)
        if not server:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(server, key, value)

        db.commit()
        db.refresh(server)

        # 清除 Agent 缓存
        AgentFactory.clear_cache(agent_id)

        return server

    @staticmethod
    def delete(
        db: Session,
        server_id: UUID,
        agent_id: UUID,
    ) -> bool:
        """软删除 MCP Server 配置."""
        server = McpServerService.get(db, server_id, agent_id)
        if not server:
            return False

        server.is_deleted = True
        db.commit()

        # 清除 Agent 缓存
        AgentFactory.clear_cache(agent_id)

        return True

    @staticmethod
    def update_connection_status(
        db: Session,
        server_id: UUID,
        success: bool,
        error: Optional[str] = None,
        tools: Optional[list[dict]] = None,
    ):
        """更新 MCP Server 的连接状态（测试连接后调用）."""
        from datetime import datetime, timezone

        server = db.query(AgentMcpServer).filter(AgentMcpServer.id == server_id).first()
        if not server:
            return

        if success:
            server.last_connected_at = datetime.now(timezone.utc)
            server.last_error = None
            server.cached_tools = tools
        else:
            server.last_error = error

        db.commit()
