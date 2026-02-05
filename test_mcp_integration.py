"""
MCP Integration 测试

测试 MCP Server 配置的 CRUD 操作和连接测试功能。
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4


@pytest.mark.asyncio
class TestMCPIntegration:
    """MCP 集成测试"""

    async def test_create_mcp_server(self, client: AsyncClient, auth_headers, test_agent_id):
        """测试创建 MCP Server 配置"""
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
        print(f"✓ Created MCP Server: {data['id']}")

    async def test_list_mcp_servers(self, client: AsyncClient, auth_headers, test_agent_id):
        """测试列出 MCP Server 配置"""
        response = await client.get(
            f"/api/v1/agents/{test_agent_id}/mcp-servers",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ Listed {len(response.json())} MCP Servers")

    async def test_update_mcp_server(
        self, client: AsyncClient, auth_headers, test_agent_id, test_mcp_server_id
    ):
        """测试更新 MCP Server 配置"""
        response = await client.put(
            f"/api/v1/agents/{test_agent_id}/mcp-servers/{test_mcp_server_id}",
            json={"name": "updated-server", "is_enabled": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "updated-server"
        assert data["is_enabled"] is False
        print(f"✓ Updated MCP Server: {data['id']}")

    async def test_delete_mcp_server(
        self, client: AsyncClient, auth_headers, test_agent_id, test_mcp_server_id
    ):
        """测试删除 MCP Server 配置"""
        response = await client.delete(
            f"/api/v1/agents/{test_agent_id}/mcp-servers/{test_mcp_server_id}",
            headers=auth_headers,
        )
        assert response.status_code == 204
        print(f"✓ Deleted MCP Server: {test_mcp_server_id}")

    async def test_headers_masked_in_response(
        self, client: AsyncClient, auth_headers, test_agent_id
    ):
        """测试响应中 header 值被脱敏"""
        # 创建带 Authorization header 的 server
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
        print(f"✓ Headers masked: {data['headers']['Authorization']}")


# Fixtures
@pytest.fixture
async def test_agent_id(client: AsyncClient, auth_headers):
    """创建测试 Agent"""
    response = await client.post(
        "/api/v1/agents",
        json={
            "name": "Test Agent for MCP",
            "system_prompt": "You are a test agent",
        },
        headers=auth_headers,
    )
    agent_id = response.json()["id"]
    yield agent_id
    # Cleanup
    await client.delete(f"/api/v1/agents/{agent_id}", headers=auth_headers)


@pytest.fixture
async def test_mcp_server_id(client: AsyncClient, auth_headers, test_agent_id):
    """创建测试 MCP Server"""
    response = await client.post(
        f"/api/v1/agents/{test_agent_id}/mcp-servers",
        json={
            "name": "fixture-server",
            "url": "http://localhost:9000/mcp",
        },
        headers=auth_headers,
    )
    server_id = response.json()["id"]
    yield server_id
    # Cleanup handled by agent deletion


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
