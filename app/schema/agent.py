"""
Agent schemas - Request and response models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class AgentBase(BaseModel):
    """Agent base schema."""
    
    name: str = Field(..., min_length=1, max_length=255, description="Agent 名称")
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    model: Optional[str] = Field("gpt-4o-mini", description="模型名称")
    model_provider: Optional[str] = Field("openai", description="模型提供商")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="温度参数")
    max_tokens: Optional[int] = Field(4096, gt=0, description="最大 token 数")
    tools: Optional[list] = Field(default_factory=list, description="工具列表")
    skills: Optional[list] = Field(None, description="技能目录路径列表")
    memory_files: Optional[list] = Field(None, description="记忆文件路径列表")
    metadata_: Optional[dict] = Field(None, alias="metadata", description="扩展元数据")


class AgentCreate(AgentBase):
    """Create agent request."""
    pass


class AgentUpdate(BaseModel):
    """Update agent request."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Agent 名称")
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    model: Optional[str] = Field(None, description="模型名称")
    model_provider: Optional[str] = Field(None, description="模型提供商")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="温度参数")
    max_tokens: Optional[int] = Field(None, gt=0, description="最大 token 数")
    tools: Optional[list] = Field(None, description="工具列表")
    skills: Optional[list] = Field(None, description="技能目录路径列表")
    memory_files: Optional[list] = Field(None, description="记忆文件路径列表")
    metadata_: Optional[dict] = Field(None, alias="metadata", description="扩展元数据")


class AgentResponse(AgentBase):
    """Agent response."""
    
    id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    
    model_config = ConfigDict(from_attributes=True)


class AgentListResponse(BaseModel):
    """Agent list response."""
    
    items: list[AgentResponse]
    total: int
    page: int
    page_size: int
