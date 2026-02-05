# app/db/model/background_task.py

"""Background task model for tracking async operations."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, String, Text, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.db.model.base import Base


class BackgroundTask(Base):
    """Background task for async operations like indexing, embedding generation."""

    __tablename__ = "background_task"

    id: UUID = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: UUID = Column(PGUUID(as_uuid=True), ForeignKey("user.id"), nullable=False, index=True)
    
    # Task type: "index_session", "backfill_embeddings", "reindex_session", etc.
    task_type: str = Column(String(50), nullable=False, index=True)
    
    # Status: "pending", "running", "completed", "failed", "cancelled"
    status: str = Column(String(20), nullable=False, default="pending", index=True)
    
    # Related entity (optional)
    session_id: Optional[UUID] = Column(PGUUID(as_uuid=True), ForeignKey("session.id"), nullable=True, index=True)
    
    # Progress tracking
    total_items: int = Column(Integer, nullable=False, default=0)
    processed_items: int = Column(Integer, nullable=False, default=0)
    failed_items: int = Column(Integer, nullable=False, default=0)
    
    # Task parameters (JSON)
    params: dict = Column(JSON, nullable=True)
    
    # Result or error message
    result: Optional[str] = Column(Text, nullable=True)
    error: Optional[str] = Column(Text, nullable=True)
    
    # Timestamps
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Optional[datetime] = Column(DateTime, nullable=True)
    completed_at: Optional[datetime] = Column(DateTime, nullable=True)
    updated_at: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="background_tasks")
    session = relationship("Session", back_populates="background_tasks")

    def __repr__(self):
        return f"<BackgroundTask {self.id} type={self.task_type} status={self.status}>"

    @property
    def progress_percent(self) -> float:
        """Calculate progress percentage."""
        if self.total_items == 0:
            return 0.0
        return round((self.processed_items / self.total_items) * 100, 2)

    @property
    def is_finished(self) -> bool:
        """Check if task is finished (completed, failed, or cancelled)."""
        return self.status in ("completed", "failed", "cancelled")
