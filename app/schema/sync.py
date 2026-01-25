from datetime import datetime
from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field


# ============ Sync Operation Types ============
SyncOperation = Literal["create", "update", "delete"]


# ============ Activity Sync Schemas ============
class ActivitySyncItem(BaseModel):
    """Activity 同步项"""
    operation: SyncOperation = Field(..., description="操作类型: create/update/delete")
    id: Optional[UUID] = Field(None, description="Activity ID (update/delete 时必填)")
    
    # Activity 字段
    type: Optional[str] = Field(None, description="活动类型", max_length=100)
    name: Optional[str] = Field(None, description="活动名称", max_length=255)
    priority: Optional[int] = Field(None, description="优先级")
    comments: Optional[str] = Field(None, description="备注")
    tags: Optional[list[str]] = Field(None, description="标签列表")
    source_type: Optional[str] = Field(None, description="来源类型", max_length=50)
    source_id: Optional[str] = Field(None, description="来源ID", max_length=255)
    relation_ids: Optional[list[str]] = Field(None, description="关联ID列表")
    status: Optional[str] = Field(None, description="状态: pending/active/done/dismissed", max_length=20)
    remind_at: Optional[datetime] = Field(None, description="提醒时间")
    due_date: Optional[datetime] = Field(None, description="截止日期")
    
    # 版本控制
    version: Optional[int] = Field(None, description="客户端版本号，用于乐观锁")
    client_updated_at: Optional[datetime] = Field(None, description="客户端更新时间")


class ActivitySyncResult(BaseModel):
    """Activity 同步结果"""
    id: UUID = Field(..., description="Activity ID")
    operation: SyncOperation = Field(..., description="执行的操作")
    success: bool = Field(..., description="是否成功")
    error: Optional[str] = Field(None, description="错误信息")
    conflict: bool = Field(False, description="是否存在冲突")
    version: Optional[int] = Field(None, description="服务器端版本号")
    server_updated_at: Optional[datetime] = Field(None, description="服务器更新时间")


# ============ Session Sync Schemas ============
class SessionSyncItem(BaseModel):
    """Session 同步项"""
    operation: SyncOperation = Field(..., description="操作类型: create/update/delete")
    id: Optional[UUID] = Field(None, description="Session ID (update/delete 时必填)")
    
    # Session 字段
    name: Optional[str] = Field(None, description="会话名称", max_length=255)
    type: Optional[str] = Field(None, description="会话类型: pm/group/ai/<plugin_type>", max_length=50)
    agent_id: Optional[UUID] = Field(None, description="关联的 Agent ID")
    metadata: Optional[dict] = Field(None, description="扩展元数据")
    source: Optional[str] = Field(None, description="来源", max_length=50)
    last_visited_at: Optional[datetime] = Field(None, description="最后访问时间")
    
    # 版本控制
    version: Optional[int] = Field(None, description="客户端版本号，用于乐观锁")
    client_updated_at: Optional[datetime] = Field(None, description="客户端更新时间")


class SessionSyncResult(BaseModel):
    """Session 同步结果"""
    id: UUID = Field(..., description="Session ID")
    operation: SyncOperation = Field(..., description="执行的操作")
    success: bool = Field(..., description="是否成功")
    error: Optional[str] = Field(None, description="错误信息")
    conflict: bool = Field(False, description="是否存在冲突")
    version: Optional[int] = Field(None, description="服务器端版本号")
    server_updated_at: Optional[datetime] = Field(None, description="服务器更新时间")


# ============ Topic Sync Schemas ============
class TopicSyncItem(BaseModel):
    """Topic 同步项"""
    operation: SyncOperation = Field(..., description="操作类型: create/update/delete")
    id: Optional[UUID] = Field(None, description="Topic ID (update/delete 时必填)")
    
    # Topic 字段
    name: Optional[str] = Field(None, description="话题名称", max_length=255)
    session_id: Optional[UUID] = Field(None, description="所属会话ID")
    
    # 版本控制
    version: Optional[int] = Field(None, description="客户端版本号，用于乐观锁")
    client_updated_at: Optional[datetime] = Field(None, description="客户端更新时间")


class TopicSyncResult(BaseModel):
    """Topic 同步结果"""
    id: UUID = Field(..., description="Topic ID")
    operation: SyncOperation = Field(..., description="执行的操作")
    success: bool = Field(..., description="是否成功")
    error: Optional[str] = Field(None, description="错误信息")
    conflict: bool = Field(False, description="是否存在冲突")
    version: Optional[int] = Field(None, description="服务器端版本号")
    server_updated_at: Optional[datetime] = Field(None, description="服务器更新时间")


# ============ Message Sync Schemas ============
class MessagePartSyncItem(BaseModel):
    """MessagePart 同步项（嵌套在 Message 中）"""
    id: Optional[UUID] = Field(None, description="MessagePart ID（更新时使用）")
    type: str = Field(..., description="内容类型: text/image/at/url/json", max_length=50)
    content: str = Field(..., description="内容")
    metadata: Optional[dict] = Field(None, description="扩展元数据")
    event_id: Optional[str] = Field(None, description="关联事件ID", max_length=255)
    raw_data: Optional[dict] = Field(None, description="原始数据")


class MessageSyncItem(BaseModel):
    """Message 同步项"""
    operation: SyncOperation = Field(..., description="操作类型: create/update/delete")
    id: Optional[UUID] = Field(None, description="Message ID (update/delete 时必填)")
    
    # Message 字段
    session_id: Optional[UUID] = Field(None, description="所属会话ID")
    topic_id: Optional[UUID] = Field(None, description="所属话题ID")
    role: Optional[str] = Field(None, description="角色: user/assistant/system (AI对话) 或 self/null (IM场景)", max_length=50)
    sender_id: Optional[UUID] = Field(None, description="发送者ID")
    parts: Optional[list[MessagePartSyncItem]] = Field(None, description="消息内容部分")
    
    # 版本控制
    version: Optional[int] = Field(None, description="客户端版本号，用于乐观锁")
    client_updated_at: Optional[datetime] = Field(None, description="客户端更新时间")


class MessageSyncResult(BaseModel):
    """Message 同步结果"""
    id: UUID = Field(..., description="Message ID")
    operation: SyncOperation = Field(..., description="执行的操作")
    success: bool = Field(..., description="是否成功")
    error: Optional[str] = Field(None, description="错误信息")
    conflict: bool = Field(False, description="是否存在冲突")
    version: Optional[int] = Field(None, description="服务器端版本号")
    server_updated_at: Optional[datetime] = Field(None, description="服务器更新时间")


# ============ Batch Sync Request/Response ============
class SyncRequest(BaseModel):
    """批量同步请求"""
    activities: Optional[list[ActivitySyncItem]] = Field(default_factory=list, description="Activity 同步项列表")
    sessions: Optional[list[SessionSyncItem]] = Field(default_factory=list, description="Session 同步项列表")
    topics: Optional[list[TopicSyncItem]] = Field(default_factory=list, description="Topic 同步项列表")
    messages: Optional[list[MessageSyncItem]] = Field(default_factory=list, description="Message 同步项列表")
    
    # 同步策略
    conflict_strategy: Literal["server_wins", "client_wins", "fail"] = Field(
        "server_wins", 
        description="冲突解决策略: server_wins(服务器优先)/client_wins(客户端优先)/fail(失败)"
    )


class SyncResponse(BaseModel):
    """批量同步响应"""
    activities: list[ActivitySyncResult] = Field(default_factory=list, description="Activity 同步结果")
    sessions: list[SessionSyncResult] = Field(default_factory=list, description="Session 同步结果")
    topics: list[TopicSyncResult] = Field(default_factory=list, description="Topic 同步结果")
    messages: list[MessageSyncResult] = Field(default_factory=list, description="Message 同步结果")
    
    # 统计信息
    total_operations: int = Field(..., description="总操作数")
    successful_operations: int = Field(..., description="成功操作数")
    failed_operations: int = Field(..., description="失败操作数")
    conflicts: int = Field(..., description="冲突数")
    
    sync_timestamp: datetime = Field(..., description="同步时间戳")


# ============ Pull Sync (增量拉取) ============
class PullSyncRequest(BaseModel):
    """增量拉取请求"""
    last_sync_at: Optional[datetime] = Field(None, description="上次同步时间，为空则拉取全部")
    
    # 可选的实体类型过滤
    include_activities: bool = Field(True, description="是否包含 activities")
    include_sessions: bool = Field(True, description="是否包含 sessions")
    include_topics: bool = Field(True, description="是否包含 topics")
    include_messages: bool = Field(True, description="是否包含 messages")
    
    # 分页参数
    limit: int = Field(1000, ge=1, le=5000, description="每次拉取的最大记录数")


class PullSyncResponse(BaseModel):
    """增量拉取响应"""
    activities: list[dict] = Field(default_factory=list, description="Activity 变更列表")
    sessions: list[dict] = Field(default_factory=list, description="Session 变更列表")
    topics: list[dict] = Field(default_factory=list, description="Topic 变更列表")
    messages: list[dict] = Field(default_factory=list, description="Message 变更列表")
    
    has_more: bool = Field(..., description="是否还有更多数据")
    sync_timestamp: datetime = Field(..., description="本次同步时间戳")
    next_cursor: Optional[datetime] = Field(None, description="下次拉取的游标")
