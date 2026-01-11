from uuid import UUID

from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    """Base declarative class for SQLAlchemy models."""

    # Map Python UUID annotations to PostgreSQL UUID columns by default
    type_annotation_map = {
        UUID: PGUUID(as_uuid=True),
    }