from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field


# ============ Resource Reference (TODO: 资源缓存) ============

class ResourceRef(BaseModel):
    """外部资源引用"""
    type: str = Field(..., description="资源类型: image/file/audio/video")
    url: str = Field(..., description="资源 URL")
    cached: bool = Field(False, description="是否已缓存")
    cache_path: Optional[str] = Field(None, description="缓存路径")
    # TODO: 实现资源缓存功能


# ============ Export Schemas ============

class ExportMessagePart(BaseModel):
    """导出的消息部分"""
    original_id: UUID
    type: str
    content: str
    metadata: Optional[dict] = None
    event_id: Optional[str] = None
    raw_data: Optional[dict] = None
    created_at: datetime
    resource_refs: list[ResourceRef] = Field(default_factory=list)


class ExportMessage(BaseModel):
    """导出的消息"""
    original_id: UUID
    topic_id: Optional[UUID] = None
    role: str
    sender_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    parts: list[ExportMessagePart]


class ExportTopic(BaseModel):
    """导出的话题"""
    original_id: UUID
    name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ExportSender(BaseModel):
    """导出的发送者"""
    original_id: UUID
    name: str
    created_at: datetime


class ExportSession(BaseModel):
    """导出的会话"""
    original_id: UUID
    name: Optional[str] = None
    type: str
    source: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    # 注意：不导出 agent_id，Agent 配置不包含在导出数据中


class ExportStatistics(BaseModel):
    """导出统计"""
    total_messages: int
    total_topics: int
    total_senders: int
    date_range: dict = Field(default_factory=dict)
    filter_applied: Optional[dict] = Field(None, description="应用的筛选条件")


class SessionExportData(BaseModel):
    """完整导出数据（JSON 格式）"""
    format: str = "metahub"
    version: str = "1.0"
    export_id: str = Field(..., description="导出批次唯一标识")
    exported_at: datetime
    session: ExportSession
    senders: list[ExportSender]
    topics: list[ExportTopic]
    messages: list[ExportMessage]
    statistics: ExportStatistics


# ============ Batch Export Schemas ============

class BatchExportRequest(BaseModel):
    """批量导出请求"""
    session_ids: Optional[list[UUID]] = Field(None, description="要导出的会话ID列表，为空则导出全部")
    type_filter: Optional[list[str]] = Field(None, description="按类型筛选: ['ai', 'pm', 'group']")
    format: str = Field("jsonl", description="导出格式: json / jsonl")
    include_deleted: bool = Field(False, description="是否包含已删除消息")
    start_date: Optional[datetime] = Field(None, description="增量导出起始时间")
    end_date: Optional[datetime] = Field(None, description="增量导出结束时间")
    group_by_type: bool = Field(True, description="是否按类型分组（生成多个文件）")


class BatchExportManifest(BaseModel):
    """批量导出清单"""
    format: str = "metahub-bundle"
    version: str = "1.0"
    export_id: str
    exported_at: datetime
    files: list[dict]
    total_sessions: int
    total_messages: int


# ============ Import Schemas ============

class ImportStatistics(BaseModel):
    """单个会话导入统计"""
    imported_messages: int = 0
    imported_topics: int = 0
    imported_senders: int = 0
    merged_senders: int = 0
    skipped_messages: int = 0


class ImportedSessionInfo(BaseModel):
    """导入的会话信息"""
    session_id: UUID
    original_id: UUID
    name: Optional[str]
    type: str
    statistics: ImportStatistics


class SessionImportResponse(BaseModel):
    """导入响应"""
    success: bool
    imported_sessions: list[ImportedSessionInfo]
    total_statistics: ImportStatistics
    message: Optional[str] = None  # 可选的附加消息


class DuplicateCheck(BaseModel):
    """重复导入检查"""
    has_duplicates: bool = False
    duplicate_export_ids: list[str] = Field(default_factory=list)
    affected_sessions: list[str] = Field(default_factory=list)


class SessionPreview(BaseModel):
    """会话预览"""
    original_id: str
    name: Optional[str]
    type: str
    message_count: int
    topic_count: int


class ImportPreviewResponse(BaseModel):
    """导入预览响应"""
    valid: bool
    format: str
    version: str
    export_id: Optional[str] = None
    sessions: list[SessionPreview] = Field(default_factory=list)
    total_statistics: Optional[ExportStatistics] = None
    duplicate_check: Optional[DuplicateCheck] = None
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
