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
from app.schema.agent import (
    AgentCreate,
    AgentUpdate,
    AgentResponse,
)
from app.service.agent import AgentService
from pydantic import BaseModel, Field

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentListResponse(BaseModel):
    """Agent list response."""
    
    items: list[AgentResponse]
    total: int
    page: int
    page_size: int


def _agent_to_response(agent: Agent) -> dict:
    """Convert Agent model to response dict."""
    return {
        "id": agent.id,
        "name": agent.name,
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
        "subagents": [
            {
                "id": sa.id,
                "name": sa.name,
                "description": sa.description,
                "system_prompt": sa.system_prompt,
                "model": sa.model,
                "tools": sa.tools or []
            }
            for sa in agent.subagents if not sa.is_deleted
        ],
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


@router.post("", response_model=AgentResponse, status_code=201)
def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new agent."""
    agent = AgentService.create_agent(db, agent_data)
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
    
    # Clear agent cache to apply new configuration
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)
    
    return _agent_to_response(agent)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete agent (soft delete)."""
    success = AgentService.delete_agent(db, agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Clear agent cache
    from app.agent.factory import AgentFactory
    AgentFactory.clear_cache(agent_id)
    
    return None
