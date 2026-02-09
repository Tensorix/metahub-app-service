"""
测试 Agent 统一抽象 API 端点
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.service.agent import AgentService
from app.schema.agent import AgentCreate


class TestAgentUnificationAPI:
    """测试 Agent 统一抽象 API"""

    def test_create_agent_with_description(self, client: TestClient, auth_headers: dict):
        """测试创建带 description 的 Agent"""
        response = client.post(
            "/api/v1/agents",
            json={
                "name": "测试 Agent",
                "description": "这是一个测试 Agent",
                "model": "gpt-4o-mini",
                "system_prompt": "你是一个测试助手",
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "测试 Agent"
        assert data["description"] == "这是一个测试 Agent"
        assert data["model"] == "gpt-4o-mini"

    def test_mount_subagent_api(
        self, client: TestClient, auth_headers: dict, db: Session
    ):
        """测试挂载 SubAgent API"""
        # 创建父 Agent
        parent = AgentService.create_agent(
            db, AgentCreate(name="Parent", model="gpt-4o")
        )
        
        # 创建子 Agent
        child = AgentService.create_agent(
            db, AgentCreate(name="Child", model="gpt-4o-mini")
        )
        
        # 挂载
        response = client.post(
            f"/api/v1/agents/{parent.id}/subagents",
            json={
                "agent_id": str(child.id),
                "mount_description": "负责搜索任务",
                "sort_order": 0,
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["agent_id"] == str(child.id)
        assert data["name"] == "Child"
        assert data["mount_description"] == "负责搜索任务"
        assert data["effective_description"] == "负责搜索任务"

    def test_list_mounted_subagents_api(
        self, client: TestClient, auth_headers: dict, db: Session
    ):
        """测试列出已挂载的 SubAgent API"""
        # 创建并挂载
        parent = AgentService.create_agent(
            db, AgentCreate(name="Parent", model="gpt-4o")
        )
        child1 = AgentService.create_agent(
            db, AgentCreate(name="Child 1", model="gpt-4o-mini")
        )
        child2 = AgentService.create_agent(
            db, AgentCreate(name="Child 2", model="gpt-4o-mini")
        )
        
        from app.schema.agent import MountSubagentRequest
        
        AgentService.mount_subagent(
            db, parent.id, MountSubagentRequest(agent_id=child1.id, sort_order=0)
        )
        AgentService.mount_subagent(
            db, parent.id, MountSubagentRequest(agent_id=child2.id, sort_order=1)
        )
        
        # 列出
        response = client.get(
            f"/api/v1/agents/{parent.id}/subagents",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Child 1"
        assert data[1]["name"] == "Child 2"

    def test_unmount_subagent_api(
        self, client: TestClient, auth_headers: dict, db: Session
    ):
        """测试卸载 SubAgent API"""
        # 创建并挂载
        parent = AgentService.create_agent(
            db, AgentCreate(name="Parent", model="gpt-4o")
        )
        child = AgentService.create_agent(
            db, AgentCreate(name="Child", model="gpt-4o-mini")
        )
        
        from app.schema.agent import MountSubagentRequest
        
        AgentService.mount_subagent(
            db, parent.id, MountSubagentRequest(agent_id=child.id)
        )
        
        # 卸载
        response = client.delete(
            f"/api/v1/agents/{parent.id}/subagents/{child.id}",
            headers=auth_headers,
        )
        
        assert response.status_code == 204
        
        # 验证已卸载
        response = client.get(
            f"/api/v1/agents/{parent.id}/subagents",
            headers=auth_headers,
        )
        assert len(response.json()) == 0

    def test_list_mountable_agents_api(
        self, client: TestClient, auth_headers: dict, db: Session
    ):
        """测试列出可挂载的 Agent API"""
        # 创建 A -> B 的链
        agent_a = AgentService.create_agent(
            db, AgentCreate(name="Agent A", model="gpt-4o-mini")
        )
        agent_b = AgentService.create_agent(
            db, AgentCreate(name="Agent B", model="gpt-4o-mini")
        )
        agent_c = AgentService.create_agent(
            db, AgentCreate(name="Agent C", model="gpt-4o-mini")
        )
        
        from app.schema.agent import MountSubagentRequest
        
        # A -> B
        AgentService.mount_subagent(
            db, agent_a.id, MountSubagentRequest(agent_id=agent_b.id)
        )
        
        # 查询 B 可以挂载哪些 Agent
        # 应该排除：B 自己、A（父级）
        # 可以挂载：C
        response = client.get(
            f"/api/v1/agents/{agent_b.id}/mountable",
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        
        mountable_ids = {item["id"] for item in data["items"]}
        assert str(agent_c.id) in mountable_ids
        assert str(agent_a.id) not in mountable_ids  # 父级
        assert str(agent_b.id) not in mountable_ids  # 自己

    def test_update_mount_description_api(
        self, client: TestClient, auth_headers: dict, db: Session
    ):
        """测试更新挂载描述 API"""
        # 创建并挂载
        parent = AgentService.create_agent(
            db, AgentCreate(name="Parent", model="gpt-4o")
        )
        child = AgentService.create_agent(
            db, AgentCreate(name="Child", model="gpt-4o-mini")
        )
        
        from app.schema.agent import MountSubagentRequest
        
        AgentService.mount_subagent(
            db,
            parent.id,
            MountSubagentRequest(
                agent_id=child.id, mount_description="原始描述"
            ),
        )
        
        # 更新
        response = client.put(
            f"/api/v1/agents/{parent.id}/subagents/{child.id}",
            json={"mount_description": "更新后的描述"},
            headers=auth_headers,
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["mount_description"] == "更新后的描述"
        assert data["effective_description"] == "更新后的描述"

    def test_create_agent_with_mount_subagents_api(
        self, client: TestClient, auth_headers: dict, db: Session
    ):
        """测试创建 Agent 时同时挂载 SubAgent API"""
        # 先创建子 Agent
        child1 = AgentService.create_agent(
            db, AgentCreate(name="Child 1", model="gpt-4o-mini")
        )
        child2 = AgentService.create_agent(
            db, AgentCreate(name="Child 2", model="gpt-4o-mini")
        )
        
        # 创建父 Agent 并同时挂载
        response = client.post(
            "/api/v1/agents",
            json={
                "name": "Parent",
                "model": "gpt-4o",
                "mount_subagents": [
                    {
                        "agent_id": str(child1.id),
                        "mount_description": "负责搜索",
                        "sort_order": 0,
                    },
                    {
                        "agent_id": str(child2.id),
                        "mount_description": "负责代码",
                        "sort_order": 1,
                    },
                ],
            },
            headers=auth_headers,
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Parent"
        assert len(data["subagents"]) == 2
        assert data["subagents"][0]["mount_description"] == "负责搜索"
        assert data["subagents"][1]["mount_description"] == "负责代码"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
