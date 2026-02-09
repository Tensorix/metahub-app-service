"""
Agent management API endpoints.
"""

from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.db.model.user import User
from app.db.model.agent import Agent
from app.db.model.agent_subagent import AgentSubagent
from app.schema.agent import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
    AgentListResponse,
    MountSubagentRequest,
    UpdateMountRequest,
    BatchMountSubagentRequest,
    MountedSubagentSummary,
)
from app.service.agent import AgentService

router = APIRouter(prefix="/agents", tags=["agents"])


def _build_mount_summary(mount: AgentSubagent) -> MountedSubagentSummary:
    """从 AgentSubagent ORM 对象构建响应 Summary。"""
    child = mount.child_agent
    return MountedSubagentSummary(
        agent_id=child.id,
        name=child.name,
        description=child.description,
        mount_description=mount.mount_description,
        effective_description=mount.mount_description or child.description or "",
        model=child.model,
        model_provider=child.model_provider,
        tools=child.tools or [],
        has_mcp_servers=bool(child.mcp_servers),
        sort_order=mount.sort_order,
    )


def _agent_to_response(agent: Agent) -> dict:
    """Convert Agent model to response dict."""
    # 构建 subagent summaries
    subagent_summaries = []
    for mount in agent.mounted_subagents:
        child = mount.child_agent
        if child.is_deleted:
            continue
        subagent_summaries.append({
            "agent_id": child.id,
            "name": child.name,
            "description": child.description,
            "mount_description": mount.mount_description,
            "effective_description": mount.mount_description or child.description or "",
            "model": child.model,
            "model_provider": child.model_provider,
            "tools": child.tools or [],
            "has_mcp_servers": bool(child.mcp_servers),
            "sort_order": mount.sort_order,
        })
    
    return {
        "id": agent.id,
        "name": agent.name,
        "description": agent.description,
        "system_prompt": agent.system_prompt,
        "model": agent.model,
        "model_provider": agent.model_provider,
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
        "tools": agent.tools or [],
        "skills": agent.skills,
        "memory_files": agent.memory_files,
        "metadata": agent.metadata_,
        "created_at": agent.created_at,
        "updated_at": agent.updated_at,
        "is_deleted": agent.is_deleted,
        "subagents": subagent_summaries,
        "mcp_servers": [
            {
                "id": mcp.id,
                "agent_id": mcp.agent_id,
                "name": mcp.name,
                "description": mcp.description,
                "transport": mcp.transport,
                "url": mcp.url,
                "headers": mcp.headers,
                "is_enabled": mcp.is_enabled,
                "sort_order": mcp.sort_order,
                "last_connected_at": mcp.last_connected_at,
                "last_error": mcp.last_error,
                "cached_tools": mcp.cached_tools,
                "created_at": mcp.created_at,
                "updated_at": mcp.updated_at,
            }
            for mcp in agent.mcp_servers if not mcp.is_deleted
        ],
        "summarization": agent.summarization_config
    }


# ============================================================
# Agent CRUD
# ============================================================

@router.post("", response_model=AgentResponse, status_code=201)
def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new agent."""
    try:
        agent = AgentService.create_agent(db, agent_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _agent_to_response(agent)


@router.get("", response_model=AgentListResponse)
def list_agents(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    search: Optional[str] = Query(None, description="Search by name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all agents with pagination."""
    agents, total = AgentService.list_agents(db, page, page_size, search)
    
    items = [_agent_to_response(agent) for agent in agents]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get agent by ID."""
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    return _agent_to_response(agent)


@router.put("/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update agent."""
    agent = AgentService.update_agent(db, agent_id, agent_data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # 级联清除：修改 Agent 后，所有将其作为 SubAgent 的父 Agent 也需清缓存
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache_cascade(agent_id, db)
    
    return _agent_to_response(agent)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete agent (soft delete)."""
    # 删除前：获取所有父 Agent ID 用于清缓存
    parent_agents = AgentService.list_parent_agents(db, agent_id)
    parent_ids = [a.id for a in parent_agents]
    
    success = AgentService.delete_agent(db, agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Clear agent cache
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)
    for pid in parent_ids:
        AgentFactory.clear_cache(pid)
    
    return None


# ============================================================
# SubAgent 挂载管理
# ============================================================

@router.get(
    "/{agent_id}/subagents",
    response_model=list[MountedSubagentSummary],
    summary="列出已挂载的 SubAgent",
)
def list_subagents(
    agent_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    mounts = AgentService.list_mounted_subagents(db, agent_id)
    return [_build_mount_summary(m) for m in mounts]


@router.post(
    "/{agent_id}/subagents",
    response_model=MountedSubagentSummary,
    status_code=201,
    summary="挂载一个 SubAgent",
)
def mount_subagent(
    agent_id: UUID,
    body: MountSubagentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        mount = AgentService.mount_subagent(db, agent_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 清除缓存
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)

    return _build_mount_summary(mount)


@router.put(
    "/{agent_id}/subagents/{child_id}",
    response_model=MountedSubagentSummary,
    summary="更新已挂载 SubAgent 的配置",
)
def update_subagent_mount(
    agent_id: UUID,
    child_id: UUID,
    body: UpdateMountRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    mount = AgentService.update_mount(db, agent_id, child_id, body)
    if not mount:
        raise HTTPException(status_code=404, detail="Mount not found")

    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)

    return _build_mount_summary(mount)


@router.delete(
    "/{agent_id}/subagents/{child_id}",
    status_code=204,
    summary="卸载 SubAgent",
)
def unmount_subagent(
    agent_id: UUID,
    child_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    success = AgentService.unmount_subagent(db, agent_id, child_id)
    if not success:
        raise HTTPException(status_code=404, detail="Mount not found")

    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)


@router.put(
    "/{agent_id}/subagents",
    response_model=list[MountedSubagentSummary],
    summary="批量替换所有 SubAgent",
)
def replace_subagents(
    agent_id: UUID,
    body: BatchMountSubagentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        mounts = AgentService.replace_mounted_subagents(
            db, agent_id, body.subagents
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)

    return [_build_mount_summary(m) for m in mounts]


@router.get(
    "/{agent_id}/mountable",
    response_model=AgentListResponse,
    summary="列出可挂载的候选 Agent",
)
def list_mountable_agents(
    agent_id: UUID,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agents, total = AgentService.list_mountable_agents(
        db, agent_id, search=search, page=page, page_size=page_size
    )
    return {
        "items": [_agent_to_response(a) for a in agents],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
