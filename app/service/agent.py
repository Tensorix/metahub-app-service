"""
Agent service - Business logic for agent management.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from app.db.model.agent import Agent
from app.db.model.subagent import SubAgent
from app.schema.agent import AgentCreate, AgentUpdate, SubAgentSchema


class AgentService:
    """Agent service for CRUD operations."""
    
    @staticmethod
    def create_agent(
        db: Session,
        agent_data: AgentCreate
    ) -> Agent:
        """Create a new agent."""
        # Extract subagents data
        subagents_data = agent_data.subagents or []
        summarization_data = agent_data.summarization
        
        # Create agent without subagents
        agent_dict = agent_data.model_dump(exclude_unset=True, exclude={'subagents', 'summarization'})
        
        # Store summarization config
        if summarization_data:
            agent_dict['summarization_config'] = summarization_data.model_dump()
        
        agent = Agent(**agent_dict)
        db.add(agent)
        db.flush()  # Get agent.id
        
        # Create subagents
        for sa_data in subagents_data:
            subagent = SubAgent(
                parent_agent_id=agent.id,
                name=sa_data.name,
                description=sa_data.description,
                system_prompt=sa_data.system_prompt,
                model=sa_data.model,
                tools=sa_data.tools or []
            )
            db.add(subagent)
        
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
        """Update agent."""
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return None
        
        update_data = agent_data.model_dump(exclude_unset=True, exclude={'subagents', 'summarization'})
        
        # Update basic fields
        for field, value in update_data.items():
            setattr(agent, field, value)
        
        # Update summarization config
        if agent_data.summarization is not None:
            agent.summarization_config = agent_data.summarization.model_dump()
        
        # Update subagents if provided
        if agent_data.subagents is not None:
            # Delete existing subagents
            db.query(SubAgent).filter(
                SubAgent.parent_agent_id == agent_id
            ).delete()
            
            # Create new subagents
            for sa_data in agent_data.subagents:
                subagent = SubAgent(
                    parent_agent_id=agent.id,
                    name=sa_data.name,
                    description=sa_data.description,
                    system_prompt=sa_data.system_prompt,
                    model=sa_data.model,
                    tools=sa_data.tools or []
                )
                db.add(subagent)
        
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
