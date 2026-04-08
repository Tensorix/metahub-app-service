"""Schemas for SystemConfig API."""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# --- Provider registry ---


class ProviderConfig(BaseModel):
    name: str                          # Display name, e.g. "OpenAI"
    api_base_url: str                  # e.g. "https://api.openai.com/v1"
    api_key: Optional[str] = None      # null → env fallback
    provider_type: Literal["openai", "openrouter"] = "openai"


# --- Config value schemas ---


class MessageAnalyzerConfigValue(BaseModel):
    provider: str = "openai"           # key into providers registry
    model_name: str = "gpt-4o-mini"


class EmbeddingConfigValue(BaseModel):
    provider: str = "openai"
    model_name: str = "text-embedding-3-large"
    dimensions: int = 3072
    max_tokens: int = 8191
    batch_size: int = 100


class AgentDefaultConfigValue(BaseModel):
    provider: str = "openai"
    model_name: str = "gpt-4o-mini"


class SandboxConfigValue(BaseModel):
    enabled: bool = False
    api_domain: str = ""
    api_key: str = ""
    use_server_proxy: bool = False
    default_image: str = "ubuntu"
    default_timeout: int = 600
    max_per_user: int = 3


# --- API request / response schemas ---


class SystemConfigResponse(BaseModel):
    key: str
    value: dict[str, Any]
    description: Optional[str] = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class SystemConfigUpdate(BaseModel):
    value: dict[str, Any]
    description: Optional[str] = None


class FetchModelsRequest(BaseModel):
    provider_id: Optional[str] = Field(None, description="从 provider registry 查找")
    base_url: Optional[str] = Field(None, description="直接指定 API base URL")
    api_key: Optional[str] = Field(None, description="API Key（可选）")


class UpstreamModel(BaseModel):
    id: str
    object: Optional[str] = None
    owned_by: Optional[str] = None


class FetchModelsResponse(BaseModel):
    models: list[UpstreamModel]
