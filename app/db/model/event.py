from datetime import datetime
from uuid import UUID, uuid7

from app.db.model import Base
from sqlalchemy import DateTime, String, JSON, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column


class Event(Base):
    __tablename__ = "event"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所属用户ID"
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, nullable=False)

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
    is_deleted: Mapped[bool] = mapped_column(default=False)
