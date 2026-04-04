"""SessionSandbox model — tracks one sandbox per session."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid7

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.model.base import Base


class SessionSandbox(Base):
    __tablename__ = "session_sandbox"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("session.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    sandbox_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, comment="Remote OpenSandbox ID",
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="creating",
        comment="creating | running | paused | stopping | stopped | error",
    )
    image: Mapped[str] = mapped_column(
        String(255), nullable=False, default="ubuntu",
    )
    config: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, comment="Resource limits, env vars, etc.",
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        String, nullable=True,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("UTC", func.now()),
        onupdate=func.timezone("UTC", func.now()),
        nullable=False,
    )

    # Relationships
    session = relationship("Session", backref="sandbox")
