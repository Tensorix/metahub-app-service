"""
Agent schemas - Request and response models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class SubAgentSchema(BaseModel):
    """SubAgent schema."""
    
    id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=100, description="子代理名称")
    description: str = Field(..., min_length=1, description="子代理描述")
    system_prompt: Optional[str] = Field(None, description="子代理系统提示词")
    model: Optional[str] = Field(None, description="子代理模型（为空则继承父 Agent）")
    tools: Optional[list[str]] = Field(default_factory=list, description="子代理工具列表")


class SummarizationConfig(BaseModel):
    """Summarization configuration."""
    
    enabled: bool = Field(False, description="是否启用对话摘要")
    max_messages: int = Field(50, gt=0, description="触发摘要的消息数阈值")
    keep_last_n: int = Field(20, gt=0, description="摘要后保留的最近消息数")
    summary_prompt: Optional[str] = Field(None, description="摘要提示词")
    model: Optional[str] = Field(None, description="用于生成摘要的模型")


class SkillContent(BaseModel):
    """Skill content."""
    name: str = Field(..., description="技能名称")
    content: str = Field(..., description="技能内容（Markdown）")


class MemoryContent(BaseModel):
    """Memory content."""
    name: str = Field(..., description="记忆名称")
    content: str = Field(..., description="记忆内容（Markdown）")


class AgentBase(BaseModel):
    """Agent base schema."""
    
    name: str = Field(..., min_length=1, max_length=255, description="Agent 名称")
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    model: Optional[str] = Field("gpt-4o-mini", description="模型名称")
    model_provider: Optional[str] = Field("openai", description="模型提供商")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="温度参数")
    max_tokens: Optional[int] = Field(4096, gt=0, description="最大 token 数")
    tools: Optional[list[str]] = Field(default_factory=list, description="工具列表")
    skills: Optional[list[SkillContent]] = Field(None, description="技能列表（内容存数据库）")
    memory_files: Optional[list[MemoryContent]] = Field(None, description="记忆列表（内容存数据库）")
    subagents: Optional[list[SubAgentSchema]] = Field(default_factory=list, description="子代理列表")
    summarization: Optional[SummarizationConfig] = Field(None, description="对话摘要配置")
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
    tools: Optional[list[str]] = Field(None, description="工具列表")
    skills: Optional[list[SkillContent]] = Field(None, description="技能列表")
    memory_files: Optional[list[MemoryContent]] = Field(None, description="记忆列表")
    subagents: Optional[list[SubAgentSchema]] = Field(None, description="子代理列表")
    summarization: Optional[SummarizationConfig] = Field(None, description="对话摘要配置")
    metadata_: Optional[dict] = Field(None, alias="metadata", description="扩展元数据")


class AgentResponse(AgentBase):
    """Agent response."""
    
    id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    subagents: list[SubAgentSchema] = Field(default_factory=list, description="子代理列表")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )


class AgentListResponse(BaseModel):
    """Agent list response."""
    
    items: list[AgentResponse]
    total: int
    page: int
    page_size: int
