from typing import Any
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PingEventRequest(BaseModel):
    # 允许接收任意 JSON 字段
    model_config = ConfigDict(extra='allow')


class EventResponse(BaseModel):
    """Event响应模型"""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    type: str
    raw_data: dict
    created_at: datetime
    updated_at: datetime
    is_deleted: bool