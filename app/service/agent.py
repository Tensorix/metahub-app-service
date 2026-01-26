"""
Agent service - Business logic for agent management.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.model.agent import Agent
from app.schema.session import AgentCreate, AgentUpdate


class AgentService:
    """Agent service for CRUD operations."""
    
    @staticmethod
    def create_agent(
        db: Session,
        agent_data: AgentCreate
    ) -> Agent:
        """Create a new agent."""
        agent = Agent(**agent_data.model_dump(exclude_unset=True))
        db.add(agent)
        db.commit()
        db.refresh(agent)
        return agent
    
    @staticmethod
    def get_agent(
        db: Session,
        agent_id: UUID
    ) -> Optional[Agent]:
        """Get agent by ID."""
        return db.query(Agent).filter(
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
        query = db.query(Agent).filter(Agent.is_deleted == False)
        
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
        """Update agent."""
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return None
        
        update_data = agent_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(agent, field, value)
        
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
        
        agent.is_deleted = True
        db.commit()
        return True
