from pydantic import BaseModel, Field


class ApiKeyResponse(BaseModel):
    api_key: str = Field(..., description="生成的 API Key")


class ApiKeyResetResponse(BaseModel):
    api_key: str = Field(..., description="重置后的 API Key")
    message: str = Field(..., description="提示信息")
