from typing import Any

from app.schema import BaseRequest

from pydantic import BaseModel, ConfigDict


class PingEventRequest(BaseModel):
    # ...
    model_config = ConfigDict(extra='allow')
    
    # 允许接收任意 JSON 字段