# Step 8: 测试与验证方案

## 8.1 测试策略

分层测试，从底层到集成:

```
                    ┌──────────────────┐
                    │   E2E 测试        │  前端 + 后端 + MCP Server
                    ├──────────────────┤
                    │   集成测试        │  API 端点 + Service + DB
                    ├──────────────────┤
                    │   单元测试        │  MCPClientManager, Service
                    └──────────────────┘
```

## 8.2 单元测试

### test_mcp_client_manager.py

```python
"""
MCPClientManager 单元测试.

使用 mock 避免实际连接 MCP Server。
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.agent.mcp.client_manager import MCPClientManager, MCPToolCache


class TestMCPToolCache:
    """MCPToolCache 缓存测试."""

    def test_set_and_get(self):
        cache = MCPToolCache(ttl=300)
        tools = [MagicMock(name="tool1")]
        cache.set("key1", tools)
        assert cache.get("key1") == tools

    def test_ttl_expiration(self):
        cache = MCPToolCache(ttl=0)  # 立即过期
        cache.set("key1", [MagicMock()])
        assert cache.get("key1") is None

    def test_invalidate(self):
        cache = MCPToolCache(ttl=300)
        cache.set("key1", [MagicMock()])
        cache.invalidate("key1")
        assert cache.get("key1") is None

    def test_clear(self):
        cache = MCPToolCache(ttl=300)
        cache.set("key1", [MagicMock()])
        cache.set("key2", [MagicMock()])
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None


class TestMCPClientManager:
    """MCPClientManager 测试."""

    def setup_method(self):
        self.manager = MCPClientManager()

    def test_build_server_config_basic(self):
        servers = [
            {
                "name": "test-server",
                "url": "http://localhost:8000/mcp",
                "is_enabled": True,
                "headers": None,
            }
        ]
        config = self.manager._build_server_config(servers)
        assert "test-server" in config
        assert config["test-server"]["transport"] == "streamable-http"
        assert config["test-server"]["url"] == "http://localhost:8000/mcp"

    def test_build_server_config_with_headers(self):
        servers = [
            {
                "name": "auth-server",
                "url": "http://localhost:8000/mcp",
                "is_enabled": True,
                "headers": {"Authorization": "Bearer token"},
            }
        ]
        config = self.manager._build_server_config(servers)
        assert config["auth-server"]["headers"]["Authorization"] == "Bearer token"

    def test_build_server_config_disabled_excluded(self):
        servers = [
            {
                "name": "disabled-server",
                "url": "http://localhost:8000/mcp",
                "is_enabled": False,
            }
        ]
        config = self.manager._build_server_config(servers)
        assert len(config) == 0

    @pytest.mark.asyncio
    async def test_get_tools_empty_servers(self):
        tools = await self.manager.get_tools(uuid4(), [])
        assert tools == []

    @pytest.mark.asyncio
    async def test_get_tools_cache_hit(self):
        agent_id = uuid4()
        mock_tools = [MagicMock(name="cached_tool")]
        self.manager._tool_cache.set(str(agent_id), mock_tools)

        tools = await self.manager.get_tools(agent_id, [{"name": "s", "url": "u", "is_enabled": True}])
        assert tools == mock_tools

    @pytest.mark.asyncio
    @patch("app.agent.mcp.client_manager.MultiServerMCPClient")
    async def test_get_tools_server_failure_graceful(self, mock_client_class):
        """单个 Server 失败不影响整体."""
        mock_client_class.side_effect = Exception("Connection refused")

        agent_id = uuid4()
        servers = [
            {"name": "bad-server", "url": "http://bad:8000/mcp", "is_enabled": True},
        ]

        tools = await self.manager.get_tools(agent_id, servers)
        assert tools == []  # 优雅降级，返回空列表

    def test_invalidate_cache(self):
        agent_id = uuid4()
        self.manager._tool_cache.set(str(agent_id), [MagicMock()])
        self.manager.invalidate_cache(agent_id)
        assert self.manager._tool_cache.get(str(agent_id)) is None
```

### test_mcp_server_service.py

```python
"""
McpServerService 单元测试.
"""

import pytest
from uuid import uuid4
from unittest.mock import MagicMock

from app.service.mcp_server import McpServerService
from app.schema.mcp_server import McpServerCreate


class TestMcpServerService:

    def test_create_enforces_limit(self):
        """验证 MCP Server 数量限制."""
        db = MagicMock()
        # Mock count 返回达到上限
        db.query.return_value.filter.return_value.count.return_value = 10

        with pytest.raises(ValueError, match="Maximum"):
            McpServerService.create(
                db,
                uuid4(),
                McpServerCreate(
                    name="test",
                    url="http://test/mcp",
                ),
            )
```

## 8.3 集成测试

### test_mcp_api.py

```python
"""
MCP Server API 集成测试.

需要运行中的数据库实例。
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestMCPServerAPI:

    async def test_create_mcp_server(
        self, client: AsyncClient, auth_headers, test_agent_id
    ):
        response = await client.post(
            f"/api/v1/agents/{test_agent_id}/mcp-servers",
            json={
                "name": "test-server",
                "description": "Test MCP Server",
                "url": "http://localhost:9000/mcp",
                "is_enabled": True,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "test-server"
        assert data["url"] == "http://localhost:9000/mcp"
        assert data["is_enabled"] is True

    async def test_list_mcp_servers(
        self, client: AsyncClient, auth_headers, test_agent_id
    ):
        response = await client.get(
            f"/api/v1/agents/{test_agent_id}/mcp-servers",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_update_mcp_server(
        self, client: AsyncClient, auth_headers, test_agent_id, test_server_id
    ):
        response = await client.put(
            f"/api/v1/agents/{test_agent_id}/mcp-servers/{test_server_id}",
            json={"name": "updated-name", "is_enabled": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "updated-name"
        assert response.json()["is_enabled"] is False

    async def test_delete_mcp_server(
        self, client: AsyncClient, auth_headers, test_agent_id, test_server_id
    ):
        response = await client.delete(
            f"/api/v1/agents/{test_agent_id}/mcp-servers/{test_server_id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

    async def test_headers_masked_in_response(
        self, client: AsyncClient, auth_headers, test_agent_id
    ):
        """验证响应中 header 值被脱敏."""
        # 先创建带 Authorization header 的 server
        create_resp = await client.post(
            f"/api/v1/agents/{test_agent_id}/mcp-servers",
            json={
                "name": "auth-server",
                "url": "http://localhost:9000/mcp",
                "headers": {"Authorization": "Bearer super-secret-token-12345"},
            },
            headers=auth_headers,
        )
        data = create_resp.json()
        # Authorization 值应被脱敏
        assert "super-secret-token" not in data["headers"]["Authorization"]
        assert "****" in data["headers"]["Authorization"]

    async def test_max_servers_limit(
        self, client: AsyncClient, auth_headers, test_agent_id
    ):
        """验证 MCP Server 数量上限."""
        # 创建超过限制数量的 server
        for i in range(11):
            response = await client.post(
                f"/api/v1/agents/{test_agent_id}/mcp-servers",
                json={
                    "name": f"server-{i}",
                    "url": f"http://localhost:{9000+i}/mcp",
                },
                headers=auth_headers,
            )
            if i >= 10:  # 超过默认限制 10
                assert response.status_code == 400
```

## 8.4 MCP 工具集成测试 (需要真实 MCP Server)

### 使用 FastMCP 创建测试用 MCP Server

```python
# tests/mcp/test_mcp_server.py
"""
测试用 MCP Server，提供简单的数学工具。
用于验证 MCPClientManager 的完整工作流。
"""

from fastmcp import FastMCP

mcp = FastMCP("TestMath")


@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=9999)
```

### 端到端工具调用测试

```python
# tests/mcp/test_mcp_e2e.py

import pytest
import subprocess
import time

from app.agent.mcp.client_manager import MCPClientManager


@pytest.fixture(scope="module")
def mcp_test_server():
    """启动测试 MCP Server."""
    proc = subprocess.Popen(
        ["python", "tests/mcp/test_mcp_server.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(2)  # 等待启动
    yield "http://localhost:9999/mcp"
    proc.terminate()


@pytest.mark.asyncio
async def test_full_tool_discovery(mcp_test_server):
    """完整的工具发现流程."""
    manager = MCPClientManager()
    result = await manager.test_connection(mcp_test_server)

    assert result["success"] is True
    assert len(result["tools"]) == 2
    tool_names = [t["name"] for t in result["tools"]]
    assert "add" in tool_names
    assert "multiply" in tool_names


@pytest.mark.asyncio
async def test_tools_as_langchain_tools(mcp_test_server):
    """验证 MCP 工具转换为 LangChain BaseTool."""
    from uuid import uuid4

    manager = MCPClientManager()
    tools = await manager.get_tools(
        uuid4(),
        [{"name": "math", "url": mcp_test_server, "is_enabled": True}],
    )

    assert len(tools) == 2
    for tool in tools:
        assert hasattr(tool, "name")
        assert hasattr(tool, "description")
        assert callable(getattr(tool, "invoke", None))
```

## 8.5 验证清单

### 后端验证

- [ ] `langchain-mcp-adapters` 安装成功，import 正常
- [ ] Alembic 迁移成功，`agent_mcp_server` 表创建
- [ ] Agent 模型新增 `mcp_servers` relationship 正常加载
- [ ] MCP Server CRUD API 全部通过
- [ ] Header 值在 API 响应中正确脱敏
- [ ] MCP Server 数量限制生效
- [ ] `MCPClientManager.test_connection` 对真实 MCP Server 工作
- [ ] `MCPClientManager.get_tools` 正确返回 LangChain BaseTool
- [ ] 工具缓存 TTL 正常工作
- [ ] 单个 MCP Server 失败不影响其他 Server
- [ ] Agent 缓存在 MCP 配置变更后正确清除
- [ ] DeepAgentService 正确合并内置工具和 MCP 工具
- [ ] 内置工具与 MCP 工具同名时，内置工具优先
- [ ] Agent 对话中能正确调用 MCP 工具并返回结果
- [ ] SSE streaming 中 MCP 工具调用事件正确传递

### 前端验证

- [ ] MCP Servers 标签页正确渲染
- [ ] 添加 MCP Server 表单验证正常
- [ ] Headers 编辑器可以添加/编辑/删除条目
- [ ] 敏感 header 值显示为密码输入
- [ ] 测试连接正确显示结果和工具列表
- [ ] 启用/禁用切换正常工作
- [ ] 删除确认对话框正常
- [ ] Agent 保存后 MCP Server 配置正确持久化
- [ ] 编辑 Agent 时 MCP Server 配置正确加载

## 8.6 手动测试场景

1. **基础流程**: 创建 Agent → 添加 MCP Server → 测试连接 → 保存 → 对话中使用 MCP 工具
2. **多 Server**: 一个 Agent 配置多个 MCP Server → 工具列表合并 → 各工具正常调用
3. **Server 离线**: 禁用 MCP Server → Agent 只用内置工具 → 重新启用 → MCP 工具恢复
4. **错误处理**: 配置错误 URL → 测试连接失败 → 显示错误信息 → Agent 对话不受影响
5. **缓存验证**: 修改 MCP Server 配置 → 下次对话获取更新后的工具
