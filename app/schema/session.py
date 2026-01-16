from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# ============ Session Schemas ============
class SessionBase(BaseModel):
    name: Optional[str] = Field(None, description="会话名称", max_length=255)
    type: str = Field(..., description="会话类型: pm/group/ai/<plugin_type>", max_length=50)
    agent_id: Optional[UUID] = Field(None, description="关联的 Agent ID")
    metadata: Optional[dict] = Field(None, description="扩展元数据")
    source: Optional[str] = Field(None, description="来源: null/astr_wechat/astr_qq/manual_upload", max_length=50)


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    name: Optional[str] = Field(None, description="会话名称", max_length=255)
    type: Optional[str] = Field(None, description="会话类型", max_length=50)
    agent_id: Optional[UUID] = Field(None, description="关联的 Agent ID")
    metadata: Optional[dict] = Field(None, description="扩展元数据")
    source: Optional[str] = Field(None, description="来源", max_length=50)
    last_visited_at: Optional[datetime] = Field(None, description="最后访问时间")


class SessionResponse(SessionBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="会话ID")
    last_visited_at: Optional[datetime] = Field(None, description="最后访问时间")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    is_deleted: bool = Field(..., description="是否删除")
    unread_count: int = Field(0, description="未读消息数")


class SessionListQuery(BaseModel):
    page: int = Field(1, ge=1, description="页码")
    size: int = Field(20, ge=1, le=100, description="每页数量")
    type: Optional[str] = Field(None, description="按类型筛选")
    source: Optional[str] = Field(None, description="按来源筛选")
    is_deleted: bool = Field(False, description="是否包含已删除")


class SessionListResponse(BaseModel):
    items: list[SessionResponse] = Field(..., description="会话列表")
    total: int = Field(..., description="总数量")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    pages: int = Field(..., description="总页数")


# ============ Topic Schemas ============
class TopicBase(BaseModel):
    name: Optional[str] = Field(None, description="话题名称", max_length=255)
    session_id: UUID = Field(..., description="所属会话ID")


class TopicCreate(TopicBase):
    pass


class TopicUpdate(BaseModel):
    name: Optional[str] = Field(None, description="话题名称", max_length=255)


class TopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="话题ID")
    name: Optional[str] = Field(None, description="话题名称")
    session_id: UUID = Field(..., description="所属会话ID")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    is_deleted: bool = Field(..., description="是否删除")


# ============ MessagePart Schemas ============
class MessagePartBase(BaseModel):
    type: str = Field(..., description="内容类型: text/plain/image/url/json", max_length=50)
    content: str = Field(..., description="内容")
    metadata: Optional[dict] = Field(None, description="扩展元数据")
    event_id: Optional[str] = Field(None, description="关联事件ID", max_length=255)
    raw_data: Optional[dict] = Field(None, description="原始数据")


class MessagePartCreate(MessagePartBase):
    pass


class MessagePartResponse(MessagePartBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="消息部分ID")
    message_id: UUID = Field(..., description="所属消息ID")
    created_at: datetime = Field(..., description="创建时间")


# ============ Message Schemas ============
class MessageBase(BaseModel):
    session_id: UUID = Field(..., description="所属会话ID")
    topic_id: Optional[UUID] = Field(None, description="所属话题ID")
    role: str = Field(..., description="角色: user/assistant/system", max_length=50)
    sender_id: Optional[UUID] = Field(None, description="发送者ID")


class MessageCreate(MessageBase):
    parts: list[MessagePartCreate] = Field(..., description="消息内容部分")


class MessageResponse(MessageBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="消息ID")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    is_deleted: bool = Field(..., description="是否删除")
    parts: list[MessagePartResponse] = Field(default_factory=list, description="消息内容部分")


class MessageListQuery(BaseModel):
    page: int = Field(1, ge=1, description="页码")
    size: int = Field(50, ge=1, le=200, description="每页数量")
    topic_id: Optional[UUID] = Field(None, description="按话题筛选")
    role: Optional[str] = Field(None, description="按角色筛选")
    is_deleted: bool = Field(False, description="是否包含已删除")


class MessageListResponse(BaseModel):
    items: list[MessageResponse] = Field(..., description="消息列表")
    total: int = Field(..., description="总数量")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    pages: int = Field(..., description="总页数")


# ============ MessageSender Schemas ============
class MessageSenderCreate(BaseModel):
    name: str = Field(..., description="发送者名称", max_length=255)


class MessageSenderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="发送者ID")
    name: str = Field(..., description="发送者名称")
    created_at: datetime = Field(..., description="创建时间")


# ============ Agent Schemas ============
class AgentBase(BaseModel):
    name: str = Field(..., description="Agent 名称", max_length=255)
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    metadata: Optional[dict] = Field(None, description="扩展元数据")


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Agent 名称", max_length=255)
    system_prompt: Optional[str] = Field(None, description="系统提示词")
    metadata: Optional[dict] = Field(None, description="扩展元数据")


class AgentResponse(AgentBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="Agent ID")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    is_deleted: bool = Field(..., description="是否删除")
