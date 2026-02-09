"""
Agent schemas - Request and response models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

from app.schema.mcp_server import McpServerResponse


# ============================================================
# 挂载相关 Schema
# ============================================================

class MountSubagentRequest(BaseModel):
    """将一个已有 Agent 挂载为当前 Agent 的 SubAgent。"""

    agent_id: UUID = Field(..., description="要挂载的 Agent ID")
    mount_description: Optional[str] = Field(
        None,
        description="在当前 Agent 上下文中的角色描述（覆盖子 Agent 的通用 description）",
    )
    sort_order: int = Field(0, ge=0, description="排序序号")


class UpdateMountRequest(BaseModel):
    """更新已挂载 SubAgent 的配置。"""

    mount_description: Optional[str] = Field(None, description="更新角色描述")
    sort_order: Optional[int] = Field(None, ge=0, description="更新排序序号")


class BatchMountSubagentRequest(BaseModel):
    """批量挂载多个 Agent 为 SubAgent（用于初始配置或全量替换）。"""

    subagents: list[MountSubagentRequest] = Field(
        ..., description="要挂载的 SubAgent 列表"
    )


class MountedSubagentSummary(BaseModel):
    """已挂载的 SubAgent 摘要信息。"""

    agent_id: UUID = Field(..., description="子 Agent ID")
    name: str = Field(..., description="子 Agent 名称")
    description: Optional[str] = Field(None, description="子 Agent 通用描述")
    mount_description: Optional[str] = Field(
        None, description="在父 Agent 上下文中的角色描述"
    )
    effective_description: str = Field(
        ..., description="生效的描述 (mount_description ?? description)"
    )
    model: Optional[str] = Field(None, description="子 Agent 使用的模型")
    model_provider: Optional[str] = Field(None, description="模型提供商")
    tools: list[str] = Field(default_factory=list, description="子 Agent 的工具列表")
    has_mcp_servers: bool = Field(False, description="是否配置了 MCP Servers")
    sort_order: int = Field(0, description="排序序号")

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# 保留旧的 SubAgentSchema 用于向后兼容（标记为废弃）
# ============================================================

class SubAgentSchema(BaseModel):
    """SubAgent schema (DEPRECATED - 仅用于向后兼容)."""
    
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
    description: Optional[str] = Field(None, description="通用能力描述")
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    model: Optional[str] = Field("gpt-4o-mini", description="模型名称")
    model_provider: Optional[str] = Field("openai", description="模型提供商")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, description="温度参数")
    max_tokens: Optional[int] = Field(4096, gt=0, description="最大 token 数")
    tools: Optional[list[str]] = Field(default_factory=list, description="工具列表")
    skills: Optional[list[SkillContent]] = Field(None, description="技能列表（内容存数据库）")
    memory_files: Optional[list[MemoryContent]] = Field(None, description="记忆列表（内容存数据库）")
    summarization: Optional[SummarizationConfig] = Field(None, description="对话摘要配置")
    metadata_: Optional[dict] = Field(None, alias="metadata", description="扩展元数据")


class AgentCreate(AgentBase):
    """Create agent request."""
    
    mount_subagents: Optional[list[MountSubagentRequest]] = Field(
        None,
        description="创建时同时挂载的 SubAgent 列表（可选，也可创建后再挂载）",
    )


class AgentUpdate(BaseModel):
    """Update agent request."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Agent 名称")
    description: Optional[str] = Field(None, description="通用能力描述")
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    model: Optional[str] = Field(None, description="模型名称")
    model_provider: Optional[str] = Field(None, description="模型提供商")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="温度参数")
    max_tokens: Optional[int] = Field(None, gt=0, description="最大 token 数")
    tools: Optional[list[str]] = Field(None, description="工具列表")
    skills: Optional[list[SkillContent]] = Field(None, description="技能列表")
    memory_files: Optional[list[MemoryContent]] = Field(None, description="记忆列表")
    summarization: Optional[SummarizationConfig] = Field(None, description="对话摘要配置")
    metadata_: Optional[dict] = Field(None, alias="metadata", description="扩展元数据")


class AgentResponse(AgentBase):
    """Agent response."""
    
    id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    subagents: list[MountedSubagentSummary] = Field(
        default_factory=list,
        description="已挂载的 SubAgent 列表"
    )
    mcp_servers: list[McpServerResponse] = Field(
        default_factory=list, description="MCP Server 配置列表"
    )
    
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


class AgentListQuery(BaseModel):
    """Agent 列表查询参数。"""

    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    search: Optional[str] = Field(None, description="按名称搜索")
    exclude_id: Optional[UUID] = Field(
        None,
        description="排除指定 Agent ID（用于挂载选择时排除自身及祖先）",
    )
    mountable_for: Optional[UUID] = Field(
        None,
        description="筛选可挂载为指定 Agent SubAgent 的候选列表（排除自身、祖先、已挂载的）",
    )
