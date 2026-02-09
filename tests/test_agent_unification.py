"""
测试 Agent 与 SubAgent 统一抽象功能
"""

import pytest
from uuid import uuid4
from sqlalchemy.orm import Session

from app.db.model.agent import Agent
from app.db.model.agent_subagent import AgentSubagent
from app.service.agent import AgentService
from app.schema.agent import (
    AgentCreate,
    AgentUpdate,
    MountSubagentRequest,
    UpdateMountRequest,
)


class TestAgentUnification:
    """测试 Agent 统一抽象功能"""

    def test_create_agent_with_description(self, db: Session):
        """测试创建带 description 的 Agent"""
        agent_data = AgentCreate(
            name="测试 Agent",
            description="这是一个测试 Agent，擅长处理测试任务",
            model="gpt-4o-mini",
            system_prompt="你是一个测试助手",
        )
        
        agent = AgentService.create_agent(db, agent_data)
        
        assert agent.id is not None
        assert agent.name == "测试 Agent"
        assert agent.description == "这是一个测试 Agent，擅长处理测试任务"
        assert agent.model == "gpt-4o-mini"

    def test_mount_subagent(self, db: Session):
        """测试挂载 SubAgent"""
        # 创建父 Agent
        parent = AgentService.create_agent(
            db,
            AgentCreate(
                name="主协调者",
                description="负责任务协调",
                model="gpt-4o",
            ),
        )
        
        # 创建子 Agent
        child = AgentService.create_agent(
            db,
            AgentCreate(
                name="搜索专家",
                description="擅长网络搜索",
                model="gpt-4o-mini",
                tools=["web_search"],
            ),
        )
        
        # 挂载
        mount_request = MountSubagentRequest(
            agent_id=child.id,
            mount_description="负责所有搜索任务",
            sort_order=0,
        )
        
        mount = AgentService.mount_subagent(db, parent.id, mount_request)
        
        assert mount.parent_agent_id == parent.id
        assert mount.child_agent_id == child.id
        assert mount.mount_description == "负责所有搜索任务"
        assert mount.sort_order == 0

    def test_prevent_self_mount(self, db: Session):
        """测试防止自己挂载自己"""
        agent = AgentService.create_agent(
            db,
            AgentCreate(name="测试 Agent", model="gpt-4o-mini"),
        )
        
        mount_request = MountSubagentRequest(agent_id=agent.id)
        
        with pytest.raises(ValueError, match="Cannot mount agent as its own subagent"):
            AgentService.mount_subagent(db, agent.id, mount_request)

    def test_circular_reference_detection(self, db: Session):
        """测试循环引用检测"""
        # 创建 A -> B -> C 的链
        agent_a = AgentService.create_agent(
            db, AgentCreate(name="Agent A", model="gpt-4o-mini")
        )
        agent_b = AgentService.create_agent(
            db, AgentCreate(name="Agent B", model="gpt-4o-mini")
        )
        agent_c = AgentService.create_agent(
            db, AgentCreate(name="Agent C", model="gpt-4o-mini")
        )
        
        # A -> B
        AgentService.mount_subagent(
            db, agent_a.id, MountSubagentRequest(agent_id=agent_b.id)
        )
        
        # B -> C
        AgentService.mount_subagent(
            db, agent_b.id, MountSubagentRequest(agent_id=agent_c.id)
        )
        
        # 尝试 C -> A（会形成环）
        with pytest.raises(ValueError, match="Circular reference detected"):
            AgentService.mount_subagent(
                db, agent_c.id, MountSubagentRequest(agent_id=agent_a.id)
            )

    def test_unmount_subagent(self, db: Session):
        """测试卸载 SubAgent"""
        parent = AgentService.create_agent(
            db, AgentCreate(name="Parent", model="gpt-4o-mini")
        )
        child = AgentService.create_agent(
            db, AgentCreate(name="Child", model="gpt-4o-mini")
        )
        
        # 挂载
        AgentService.mount_subagent(
            db, parent.id, MountSubagentRequest(agent_id=child.id)
        )
        
        # 卸载
        success = AgentService.unmount_subagent(db, parent.id, child.id)
        assert success is True
        
        # 验证已卸载
        mounts = AgentService.list_mounted_subagents(db, parent.id)
        assert len(mounts) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
