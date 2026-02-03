"""Tests for tools API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.api import app


@pytest.fixture
def client():
    return TestClient(app)


def test_list_tools(client):
    """Test GET /api/v1/tools returns all tools."""
    response = client.get("/api/v1/tools")
    assert response.status_code == 200

    data = response.json()
    assert "tools" in data
    assert "total" in data
    assert data["total"] >= 4  # 至少有一些工具

    # 验证必需的工具存在
    tool_names = {t["name"] for t in data["tools"]}
    assert "calculator" in tool_names or "search" in tool_names


def test_list_tools_by_category(client):
    """Test GET /api/v1/tools with category filter."""
    response = client.get("/api/v1/tools?category=math")
    assert response.status_code == 200

    data = response.json()
    # 如果有 math 分类的工具，验证它们都是 math 分类
    if data["tools"]:
        assert all(t["category"] == "math" for t in data["tools"])


def test_list_tools_categories(client):
    """Test GET /api/v1/tools/categories returns grouped tools."""
    response = client.get("/api/v1/tools/categories")
    assert response.status_code == 200

    data = response.json()
    assert "categories" in data
    assert "total" in data
    assert isinstance(data["categories"], list)


def test_get_tool_info(client):
    """Test GET /api/v1/tools/{name} returns tool details."""
    # 首先获取所有工具
    response = client.get("/api/v1/tools")
    assert response.status_code == 200
    tools = response.json()["tools"]
    
    if tools:
        # 测试第一个工具
        tool_name = tools[0]["name"]
        response = client.get(f"/api/v1/tools/{tool_name}")
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == tool_name
        assert "category" in data
        assert "description" in data


def test_get_tool_not_found(client):
    """Test GET /api/v1/tools/{name} returns 404 for unknown tool."""
    response = client.get("/api/v1/tools/nonexistent_tool_12345")
    assert response.status_code == 404
