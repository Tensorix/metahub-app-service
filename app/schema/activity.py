from datetime import datetime
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class RelationRef(BaseModel):
    """关联引用：创建/更新时提交"""
    type: Literal["session", "topic", "node"] = Field(..., description="目标类型")
    id: str = Field(..., description="目标 ID")


class RelationInfo(BaseModel):
    """关联信息：响应中返回（已解析名称等）"""
    type: Literal["session", "topic", "node"] = Field(..., description="目标类型")
    id: str = Field(..., description="目标 ID")
    name: str = Field(..., description="显示名称")
    session_id: Optional[str] = Field(None, description="所属会话 ID（topic 时）")
    session_name: Optional[str] = Field(None, description="所属会话名称（topic 时）")
    node_type: Optional[str] = Field(None, description="知识库节点类型（document/dataset）")


class ActivityBase(BaseModel):
    """Activity 基础模型"""
    type: str = Field(..., description="活动类型", max_length=100)
    name: str = Field(..., description="活动名称", max_length=255)
    priority: int = Field(0, description="优先级，数字越大优先级越高")
    comments: Optional[str] = Field(None, description="备注")
    tags: Optional[list[str]] = Field(None, description="标签列表")
    source_type: Optional[str] = Field(None, description="来源类型，如 manual/event/topic", max_length=50)
    source_id: Optional[str] = Field(None, description="来源ID", max_length=255)
    relation_ids: Optional[list[str]] = Field(None, description="关联ID列表")
    status: str = Field("pending", description="状态: pending/active/done/dismissed", max_length=20)
    sort_order: int = Field(0, description="排序序号，数字越小越靠前")
    remind_at: Optional[datetime] = Field(None, description="提醒时间")
    due_date: Optional[datetime] = Field(None, description="截止日期")


class ActivityCreate(ActivityBase):
    """创建 Activity 的请求模型"""
    relations: Optional[list[RelationRef]] = Field(None, description="关联的会话、话题、文档")


class ActivityUpdate(BaseModel):
    """更新 Activity 的请求模型"""
    relations: Optional[list[RelationRef]] = Field(None, description="关联的会话、话题、文档")
    type: Optional[str] = Field(None, description="活动类型", max_length=100)
    name: Optional[str] = Field(None, description="活动名称", max_length=255)
    priority: Optional[int] = Field(None, description="优先级，数字越大优先级越高")
    comments: Optional[str] = Field(None, description="备注")
    tags: Optional[list[str]] = Field(None, description="标签列表")
    source_type: Optional[str] = Field(None, description="来源类型，如 manual/event/topic", max_length=50)
    source_id: Optional[str] = Field(None, description="来源ID", max_length=255)
    relation_ids: Optional[list[str]] = Field(None, description="关联ID列表")
    status: Optional[str] = Field(None, description="状态: pending/active/done/dismissed", max_length=20)
    sort_order: Optional[int] = Field(None, description="排序序号，数字越小越靠前")
    remind_at: Optional[datetime] = Field(None, description="提醒时间")
    due_date: Optional[datetime] = Field(None, description="截止日期")


class ActivityReorderRequest(BaseModel):
    """活动排序请求模型"""
    ordered_ids: list[str] = Field(..., description="按顺序排列的活动ID列表")


class ActivityResponse(ActivityBase):
    """Activity 响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="活动ID")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    is_deleted: bool = Field(..., description="是否删除")
    relations: list[RelationInfo] = Field(default_factory=list, description="关联的会话、话题、文档（已解析）")

    @classmethod
    def from_activity(cls, activity, relations: list[RelationInfo]) -> "ActivityResponse":
        """从 Activity 构建响应，relations 由外部解析后传入"""
        data = {f: getattr(activity, f) for f in cls.model_fields if f != "relations" and hasattr(activity, f)}
        data["relations"] = relations
        return cls(**data)


class ActivityListQuery(BaseModel):
    """Activity 列表查询参数"""
    page: int = Field(1, ge=1, description="页码")
    size: int = Field(10, ge=1, le=100, description="每页数量")
    type: Optional[str] = Field(None, description="按类型筛选")
    priority_min: Optional[int] = Field(None, description="最小优先级")
    priority_max: Optional[int] = Field(None, description="最大优先级")
    tags: Optional[list[str]] = Field(None, description="按标签筛选（数组，匹配任意标签）")
    is_deleted: bool = Field(False, description="是否包含已删除的记录")


class ActivityListResponse(BaseModel):
    """Activity 列表响应模型"""
    items: list[ActivityResponse] = Field(..., description="活动列表")
    total: int = Field(..., description="总数量")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    pages: int = Field(..., description="总页数")