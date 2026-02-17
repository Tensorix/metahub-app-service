# app/db/model/scheduled_task.py

"""Scheduled task model for cron / interval / one-shot scheduling."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, String, Text, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.db.model.base import Base


class ScheduledTask(Base):
    """Persistent definition of a scheduled task (cron, interval, or one-shot)."""

    __tablename__ = "scheduled_task"

    id: UUID = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)

    # user_id is nullable: NULL means a system-level task
    user_id: Optional[UUID] = Column(
        PGUUID(as_uuid=True), ForeignKey("user.id"), nullable=True, index=True
    )

    name: str = Column(String(100), nullable=False)
    description: Optional[str] = Column(Text, nullable=True)

    # --- Schedule configuration ---
    # schedule_type: "cron" | "interval" | "one_shot"
    schedule_type: str = Column(String(20), nullable=False)

    # Examples:
    #   cron:     {"hour": 2, "minute": 0, "day_of_week": "mon-fri"}
    #   interval: {"minutes": 30}
    #   one_shot: {"run_at": "2026-03-01T10:00:00"}
    schedule_config: dict = Column(JSON, nullable=False)

    timezone: str = Column(String(50), nullable=False, default="UTC")

    # --- Task configuration ---
    # task_type: "send_message" | "run_agent" | "call_tool" | custom
    task_type: str = Column(String(50), nullable=False, index=True)

    # Arbitrary parameters forwarded to the task handler
    task_params: dict = Column(JSON, nullable=False, default=dict)

    # --- Status ---
    # "active" | "paused" | "completed" | "expired"
    status: str = Column(String(20), nullable=False, default="active", index=True)

    # --- Execution tracking ---
    last_run_at: Optional[datetime] = Column(DateTime, nullable=True)
    last_run_status: Optional[str] = Column(String(20), nullable=True)
    last_run_error: Optional[str] = Column(Text, nullable=True)
    next_run_at: Optional[datetime] = Column(DateTime, nullable=True)
    run_count: int = Column(Integer, nullable=False, default=0)

    # When set, the task auto-completes after reaching this many runs
    max_runs: Optional[int] = Column(Integer, nullable=True)

    # --- Timestamps ---
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: datetime = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # --- Relationships ---
    user = relationship("User", back_populates="scheduled_tasks")

    def __repr__(self):
        return (
            f"<ScheduledTask {self.id} name={self.name!r} "
            f"type={self.task_type} status={self.status}>"
        )

    @property
    def is_active(self) -> bool:
        return self.status == "active"

    @property
    def is_finished(self) -> bool:
        return self.status in ("completed", "expired")
