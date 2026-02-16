"""
Agent service - Business logic for agent management.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from app.db.model.agent import Agent
from app.db.model.agent_subagent import AgentSubagent
from app.db.model.subagent import SubAgent
from app.schema.agent import (
    AgentCreate,
    AgentUpdate,
    MountSubagentRequest,
    UpdateMountRequest,
)


class AgentService:
    """Agent service for CRUD operations."""

    @staticmethod
    def _normalize_memory_files(memory_files):
        """Normalize memory files to a single AGENTS.md entry."""
        if memory_files is None:
            return None
        if not memory_files:
            return []

        preferred = None
        fallback = None
        for item in memory_files:
            if not isinstance(item, dict):
                continue
            content = item.get("content") or ""
            name = (item.get("name") or "").strip().lower().removesuffix(".md")
            if name == "agents":
                preferred = content
                break
            if not fallback and content:
                fallback = content

        final_content = preferred if preferred is not None else (fallback or "")
        return [{"name": "AGENTS", "content": final_content}]
    
    @staticmethod
    def create_agent(
        db: Session,
        agent_data: AgentCreate
    ) -> Agent:
        """Create a new agent."""
        summarization_data = agent_data.summarization
        mount_subagents_data = agent_data.mount_subagents  # 新字段

        agent_dict = agent_data.model_dump(
            exclude_unset=True,
            exclude={"summarization", "mount_subagents"},
        )
        if "memory_files" in agent_dict:
            agent_dict["memory_files"] = AgentService._normalize_memory_files(
                agent_dict["memory_files"]
            )

        if summarization_data:
            agent_dict["summarization_config"] = summarization_data.model_dump()

        agent = Agent(**agent_dict)
        db.add(agent)
        db.flush()  # 获取 agent.id

        # 如果创建时同时挂载 SubAgent
        if mount_subagents_data:
            for mount_req in mount_subagents_data:
                AgentService._mount_subagent(
                    db, agent.id, mount_req, skip_flush=True
                )

        db.commit()
        db.refresh(agent)
        return agent
    
    @staticmethod
    def get_agent(
        db: Session,
        agent_id: UUID
    ) -> Optional[Agent]:
        """Get agent by ID."""
        return db.query(Agent).options(
            joinedload(Agent.mcp_servers)
        ).filter(
            Agent.id == agent_id,
            Agent.is_deleted == False
        ).first()
    
    @staticmethod
    def list_agents(
        db: Session,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None
    ) -> tuple[list[Agent], int]:
        """List agents with pagination."""
        query = db.query(Agent).options(
            joinedload(Agent.mcp_servers)
        ).filter(Agent.is_deleted == False)
        
        # Search by name
        if search:
            query = query.filter(Agent.name.ilike(f"%{search}%"))
        
        # Count total
        total = query.count()
        
        # Paginate
        agents = query.order_by(Agent.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        
        return list(agents), total
    
    @staticmethod
    def update_agent(
        db: Session,
        agent_id: UUID,
        agent_data: AgentUpdate
    ) -> Optional[Agent]:
        """Update agent basic information (不包含 SubAgent 管理)."""
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return None

        update_data = agent_data.model_dump(
            exclude_unset=True,
            exclude={"summarization"},
        )
        if "memory_files" in update_data:
            update_data["memory_files"] = AgentService._normalize_memory_files(
                update_data["memory_files"]
            )

        for field, value in update_data.items():
            setattr(agent, field, value)

        if agent_data.summarization is not None:
            agent.summarization_config = agent_data.summarization.model_dump()

        # ✅ 不再处理 subagents — SubAgent 挂载/卸载有独立 API

        db.commit()
        db.refresh(agent)
        return agent
    
    @staticmethod
    def delete_agent(
        db: Session,
        agent_id: UUID
    ) -> bool:
        """Soft delete agent."""
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return False

        # 清理：作为父级时的挂载关系
        db.query(AgentSubagent).filter(
            AgentSubagent.parent_agent_id == agent_id,
        ).delete()

        # 清理：作为子级时的挂载关系
        db.query(AgentSubagent).filter(
            AgentSubagent.child_agent_id == agent_id,
        ).delete()

        agent.is_deleted = True
        db.commit()
        return True

    # ============================================================
    # SubAgent 挂载管理
    # ============================================================

    @staticmethod
    def mount_subagent(
        db: Session,
        parent_agent_id: UUID,
        mount_data: MountSubagentRequest,
    ) -> AgentSubagent:
        """将一个 Agent 挂载为 SubAgent。

        Args:
            db: 数据库会话
            parent_agent_id: 父 Agent ID
            mount_data: 挂载请求数据

        Returns:
            AgentSubagent 关联记录

        Raises:
            ValueError: 目标 Agent 不存在或会造成循环引用
        """
        child_agent_id = mount_data.agent_id

        # 1. 验证子 Agent 存在
        child_agent = AgentService.get_agent(db, child_agent_id)
        if not child_agent:
            raise ValueError(f"Agent {child_agent_id} not found")

        # 2. 防止自引用 (数据库层也有 CHECK，双重保障)
        if parent_agent_id == child_agent_id:
            raise ValueError("Cannot mount agent as its own subagent")

        # 3. 循环引用检测
        if AgentService._has_circular_reference(db, parent_agent_id, child_agent_id):
            raise ValueError(
                f"Circular reference detected: Agent {child_agent_id} "
                f"is an ancestor of Agent {parent_agent_id}"
            )

        # 4. 检查是否已挂载 (数据库层也有 UNIQUE，双重保障)
        existing = db.query(AgentSubagent).filter(
            AgentSubagent.parent_agent_id == parent_agent_id,
            AgentSubagent.child_agent_id == child_agent_id,
        ).first()
        if existing:
            raise ValueError(
                f"Agent {child_agent_id} is already mounted as subagent"
            )

        # 5. 创建关联
        mount = AgentSubagent(
            parent_agent_id=parent_agent_id,
            child_agent_id=child_agent_id,
            mount_description=mount_data.mount_description,
            sort_order=mount_data.sort_order,
        )
        db.add(mount)
        db.commit()
        db.refresh(mount)
        return mount

    @staticmethod
    def _mount_subagent(
        db: Session,
        parent_agent_id: UUID,
        mount_data: MountSubagentRequest,
        skip_flush: bool = False,
    ) -> AgentSubagent:
        """内部挂载方法（不提交事务，用于 create_agent 内联挂载）。"""
        child_agent_id = mount_data.agent_id

        child_agent = db.query(Agent).filter(
            Agent.id == child_agent_id, Agent.is_deleted == False
        ).first()
        if not child_agent:
            raise ValueError(f"Agent {child_agent_id} not found")

        if parent_agent_id == child_agent_id:
            raise ValueError("Cannot mount agent as its own subagent")

        if AgentService._has_circular_reference(db, parent_agent_id, child_agent_id):
            raise ValueError("Circular reference detected")

        mount = AgentSubagent(
            parent_agent_id=parent_agent_id,
            child_agent_id=child_agent_id,
            mount_description=mount_data.mount_description,
            sort_order=mount_data.sort_order,
        )
        db.add(mount)
        if not skip_flush:
            db.flush()
        return mount

    @staticmethod
    def unmount_subagent(
        db: Session,
        parent_agent_id: UUID,
        child_agent_id: UUID,
    ) -> bool:
        """卸载一个 SubAgent（物理删除关联记录）。

        注意：不删除子 Agent 本身，仅移除挂载关系。

        Returns:
            是否成功卸载
        """
        result = db.query(AgentSubagent).filter(
            AgentSubagent.parent_agent_id == parent_agent_id,
            AgentSubagent.child_agent_id == child_agent_id,
        ).delete()
        db.commit()
        return result > 0

    @staticmethod
    def update_mount(
        db: Session,
        parent_agent_id: UUID,
        child_agent_id: UUID,
        update_data: UpdateMountRequest,
    ) -> Optional[AgentSubagent]:
        """更新已挂载 SubAgent 的配置（description、排序等）。"""
        mount = db.query(AgentSubagent).filter(
            AgentSubagent.parent_agent_id == parent_agent_id,
            AgentSubagent.child_agent_id == child_agent_id,
        ).first()

        if not mount:
            return None

        if update_data.mount_description is not None:
            mount.mount_description = update_data.mount_description
        if update_data.sort_order is not None:
            mount.sort_order = update_data.sort_order

        db.commit()
        db.refresh(mount)
        return mount

    @staticmethod
    def list_mounted_subagents(
        db: Session,
        parent_agent_id: UUID,
    ) -> list[AgentSubagent]:
        """列出 Agent 的所有已挂载 SubAgent。"""
        return (
            db.query(AgentSubagent)
            .options(joinedload(AgentSubagent.child_agent))
            .filter(AgentSubagent.parent_agent_id == parent_agent_id)
            .order_by(AgentSubagent.sort_order)
            .all()
        )

    @staticmethod
    def replace_mounted_subagents(
        db: Session,
        parent_agent_id: UUID,
        mount_list: list[MountSubagentRequest],
    ) -> list[AgentSubagent]:
        """全量替换 SubAgent 挂载列表（先清空再重建）。

        用于前端"保存全部"操作。
        """
        # 清空现有挂载
        db.query(AgentSubagent).filter(
            AgentSubagent.parent_agent_id == parent_agent_id,
        ).delete()
        db.flush()

        # 重建
        mounts = []
        for mount_data in mount_list:
            mount = AgentService._mount_subagent(
                db, parent_agent_id, mount_data, skip_flush=True
            )
            mounts.append(mount)

        db.commit()
        return mounts

    @staticmethod
    def list_mountable_agents(
        db: Session,
        parent_agent_id: UUID,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Agent], int]:
        """列出可作为指定 Agent SubAgent 的候选 Agent 列表。

        排除：
        1. 自身
        2. 已挂载的 Agent
        3. 祖先 Agent（会造成循环引用）
        """
        # 获取已挂载的 Agent ID 集合
        mounted_ids = {
            row[0]
            for row in db.query(AgentSubagent.child_agent_id).filter(
                AgentSubagent.parent_agent_id == parent_agent_id
            ).all()
        }

        # 获取所有祖先 Agent ID（向上遍历）
        ancestor_ids = AgentService._get_ancestor_ids(db, parent_agent_id)

        # 排除集合
        exclude_ids = {parent_agent_id} | mounted_ids | ancestor_ids

        query = db.query(Agent).filter(
            Agent.is_deleted == False,
            Agent.id.notin_(exclude_ids) if exclude_ids else True,
        )

        if search:
            query = query.filter(
                Agent.name.ilike(f"%{search}%")
                | Agent.description.ilike(f"%{search}%")
            )

        total = query.count()
        agents = (
            query.order_by(Agent.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return agents, total

    @staticmethod
    def list_parent_agents(
        db: Session,
        child_agent_id: UUID,
    ) -> list[Agent]:
        """列出将此 Agent 作为 SubAgent 的所有父 Agent。

        用于：
        - 删除 Agent 前提示用户影响范围
        - 修改 Agent 后通知受影响的父 Agent 清除缓存
        """
        parent_ids = [
            row[0]
            for row in db.query(AgentSubagent.parent_agent_id).filter(
                AgentSubagent.child_agent_id == child_agent_id,
            ).all()
        ]
        if not parent_ids:
            return []

        return db.query(Agent).filter(
            Agent.id.in_(parent_ids),
            Agent.is_deleted == False,
        ).all()

    # ============================================================
    # 辅助方法
    # ============================================================

    @staticmethod
    def _has_circular_reference(
        db: Session,
        parent_agent_id: UUID,
        child_agent_id: UUID,
    ) -> bool:
        """检测挂载 child_agent_id 到 parent_agent_id 是否会形成循环。

        算法：从 child_agent_id 出发，沿 parent → child 方向 BFS，
        检查是否能到达 parent_agent_id。

        即检查：child_agent_id 的 SubAgent 树中是否包含 parent_agent_id。
        如果包含，说明 parent 是 child 的后代，挂载会形成环。
        """
        # 从 child 出发，寻找其所有后代
        visited = set()
        queue = [child_agent_id]

        while queue:
            current = queue.pop(0)
            if current == parent_agent_id:
                return True  # 环路检测到！
            if current in visited:
                continue
            visited.add(current)

            # 查找 current 的所有直接子 Agent
            children = db.query(AgentSubagent.child_agent_id).filter(
                AgentSubagent.parent_agent_id == current,
            ).all()
            queue.extend([c[0] for c in children])

        return False

    @staticmethod
    def _get_ancestor_ids(db: Session, agent_id: UUID) -> set[UUID]:
        """获取 Agent 的所有祖先 ID（向上遍历挂载关系）。"""
        ancestors = set()
        queue = [agent_id]

        while queue:
            current = queue.pop(0)
            parents = db.query(AgentSubagent.parent_agent_id).filter(
                AgentSubagent.child_agent_id == current,
            ).all()
            for (pid,) in parents:
                if pid not in ancestors:
                    ancestors.add(pid)
                    queue.append(pid)

        return ancestors
