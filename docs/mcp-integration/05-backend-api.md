# Step 5: Backend API 端点设计

## 5.1 API 设计概览

为 MCP Server 管理提供 RESTful API，嵌套在 Agent 路由下:

```
/agents/{agent_id}/mcp-servers/            GET    - 列出 MCP Servers
/agents/{agent_id}/mcp-servers/            POST   - 添加 MCP Server
/agents/{agent_id}/mcp-servers/{server_id} GET    - 获取 MCP Server 详情
/agents/{agent_id}/mcp-servers/{server_id} PUT    - 更新 MCP Server
/agents/{agent_id}/mcp-servers/{server_id} DELETE - 删除 MCP Server
/agents/{agent_id}/mcp-servers/test        POST   - 测试 MCP Server 连接
```

## 5.2 Service 层

### app/service/mcp_server.py

```python
"""
MCP Server CRUD Service.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.model.agent import Agent
from app.db.model.agent_mcp_server import AgentMcpServer
from app.schema.mcp_server import McpServerCreate, McpServerUpdate
from app.agent import AgentFactory
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

        server = db.query(AgentMcpServer).filter(
            AgentMcpServer.id == server_id
        ).first()
        if not server:
            return

        if success:
            server.last_connected_at = datetime.now(timezone.utc)
            server.last_error = None
            server.cached_tools = tools
        else:
            server.last_error = error

        db.commit()
```

## 5.3 Router 层

### app/router/v1/mcp_server.py

```python
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


def _validate_agent_ownership(
    db: Session, agent_id: UUID, user_id: UUID
) -> Agent:
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
    headers = data.headers

    if data.server_id:
        server = McpServerService.get(db, data.server_id, agent_id)
        if not server:
            raise HTTPException(
                status_code=404, detail="MCP Server not found"
            )
        url = url or server.url
        headers = headers or server.headers

    if not url:
        raise HTTPException(
            status_code=400,
            detail="URL is required (either in request or from server_id)"
        )

    # 执行连接测试
    manager = get_mcp_client_manager()
    result = await manager.test_connection(url, headers)

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
```

## 5.4 Schema 补充

```python
# app/schema/mcp_server.py 中补充测试请求 schema

class McpServerTestRequest(BaseModel):
    """MCP Server 连接测试请求."""
    url: Optional[str] = Field(None, description="要测试的 URL（新建时使用）")
    headers: Optional[dict[str, str]] = Field(None, description="自定义 Headers")
    server_id: Optional[UUID] = Field(None, description="已保存的 Server ID（使用其配置测试）")
```

## 5.5 路由注册

### app/router/v1/__init__.py

```python
# 在现有路由注册中添加:
from app.router.v1.mcp_server import router as mcp_server_router

# 注册路由（与 agent router 使用相同前缀）
api_router.include_router(
    mcp_server_router,
    prefix="",       # MCP 路由已包含 /agents/{id}/mcp-servers 前缀
    tags=["mcp-servers"],
)
```

## 5.6 API 使用示例

### 添加 MCP Server

```bash
POST /api/v1/agents/{agent_id}/mcp-servers
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "database-tools",
  "description": "PostgreSQL database query tools",
  "url": "http://mcp-db-server:8080/mcp",
  "headers": {
    "Authorization": "Bearer db-token-xxx"
  },
  "is_enabled": true
}
```

### 测试连接

```bash
POST /api/v1/agents/{agent_id}/mcp-servers/test
Content-Type: application/json
Authorization: Bearer <token>

{
  "url": "http://mcp-db-server:8080/mcp",
  "headers": {
    "Authorization": "Bearer db-token-xxx"
  }
}

# Response:
{
  "success": true,
  "message": "Connected. Found 3 tools.",
  "tools": [
    {"name": "query_database", "description": "Execute SQL queries"},
    {"name": "list_tables", "description": "List all database tables"},
    {"name": "describe_table", "description": "Get table schema"}
  ],
  "latency_ms": 156.23
}
```

### 列出 MCP Servers

```bash
GET /api/v1/agents/{agent_id}/mcp-servers
Authorization: Bearer <token>

# Response:
[
  {
    "id": "uuid-1",
    "agent_id": "agent-uuid",
    "name": "database-tools",
    "description": "PostgreSQL database query tools",
    "url": "http://mcp-db-server:8080/mcp",
    "headers": {"Authorization": "Bear****-xxx"},  // 脱敏
    "is_enabled": true,
    "sort_order": 0,
    "last_connected_at": "2026-01-31T10:00:00Z",
    "last_error": null,
    "cached_tools": [...],
    "created_at": "2026-01-31T09:00:00Z",
    "updated_at": "2026-01-31T10:00:00Z"
  }
]
```
