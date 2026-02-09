"""
MCP Server management API endpoints.

Provides CRUD for MCP Server configurations per Agent,
and connection testing.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.agent import Agent
from app.deps import get_current_user
from app.db.model.user import User
from app.schema.mcp_server import (
    McpServerCreate,
    McpServerUpdate,
    McpServerResponse,
    McpServerTestRequest,
    McpServerTestResult,
)
from app.service.mcp_server import McpServerService
from app.agent.mcp import get_mcp_client_manager

router = APIRouter()


def _validate_agent_ownership(db: Session, agent_id: UUID, user_id: UUID) -> Agent:
    """验证 Agent 存在且属于当前用户."""
    # 注意: 当前 Agent 模型没有 user_id 字段
    # 如果有多租户需求，需要通过 Session 间接验证
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.is_deleted == False,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get(
    "/agents/{agent_id}/mcp-servers",
    response_model=list[McpServerResponse],
)
async def list_mcp_servers(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出 Agent 的所有 MCP Server 配置."""
    _validate_agent_ownership(db, agent_id, current_user.id)
    servers = McpServerService.list_by_agent(db, agent_id)
    return servers


@router.post(
    "/agents/{agent_id}/mcp-servers",
    response_model=McpServerResponse,
    status_code=201,
)
async def create_mcp_server(
    agent_id: UUID,
    data: McpServerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """为 Agent 添加 MCP Server 配置."""
    _validate_agent_ownership(db, agent_id, current_user.id)

    try:
        server = McpServerService.create(db, agent_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 级联清除缓存
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache_cascade(agent_id, db)

    return server


@router.get(
    "/agents/{agent_id}/mcp-servers/{server_id}",
    response_model=McpServerResponse,
)
async def get_mcp_server(
    agent_id: UUID,
    server_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取单个 MCP Server 配置详情."""
    _validate_agent_ownership(db, agent_id, current_user.id)
    server = McpServerService.get(db, server_id, agent_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    return server


@router.put(
    "/agents/{agent_id}/mcp-servers/{server_id}",
    response_model=McpServerResponse,
)
async def update_mcp_server(
    agent_id: UUID,
    server_id: UUID,
    data: McpServerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新 MCP Server 配置."""
    _validate_agent_ownership(db, agent_id, current_user.id)
    server = McpServerService.update(db, server_id, agent_id, data)
    if not server:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    
    # 级联清除缓存
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache_cascade(agent_id, db)
    
    return server


@router.delete(
    "/agents/{agent_id}/mcp-servers/{server_id}",
    status_code=204,
)
async def delete_mcp_server(
    agent_id: UUID,
    server_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除 MCP Server 配置."""
    _validate_agent_ownership(db, agent_id, current_user.id)
    success = McpServerService.delete(db, server_id, agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="MCP Server not found")
    
    # 级联清除缓存
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache_cascade(agent_id, db)


@router.post(
    "/agents/{agent_id}/mcp-servers/test",
    response_model=McpServerTestResult,
)
async def test_mcp_server(
    agent_id: UUID,
    data: McpServerTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    测试 MCP Server 连接.

    可以测试新的 URL（创建前验证），
    也可以测试已保存的配置（传入 server_id）。
    """
    _validate_agent_ownership(db, agent_id, current_user.id)

    # 如果提供了 server_id，使用已保存的配置
    url = data.url
    transport = data.transport or "http"
    headers = data.headers

    if data.server_id:
        server = McpServerService.get(db, data.server_id, agent_id)
        if not server:
            raise HTTPException(status_code=404, detail="MCP Server not found")
        url = url or server.url
        transport = transport or server.transport
        headers = headers or server.headers

    if not url:
        raise HTTPException(
            status_code=400,
            detail="URL is required (either in request or from server_id)",
        )

    # 执行连接测试
    manager = get_mcp_client_manager()
    result = await manager.test_connection(url, transport, headers)

    # 如果有 server_id，更新连接状态
    if data.server_id:
        McpServerService.update_connection_status(
            db,
            data.server_id,
            success=result["success"],
            error=result.get("message") if not result["success"] else None,
            tools=result.get("tools"),
        )

    return McpServerTestResult(**result)
