from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CommentBase(BaseModel):
    """Comment 基础模型"""

    content: str = Field(..., min_length=1, max_length=20000, description="评论内容")


class CommentCreate(CommentBase):
    """创建 Comment 的请求模型"""


class CommentUpdate(BaseModel):
    """更新 Comment 的请求模型"""

    content: str = Field(..., min_length=1, max_length=20000, description="评论内容")


class CommentResponse(CommentBase):
    """Comment 响应模型"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="评论ID")
    activity_id: UUID = Field(..., description="活动ID")
    user_id: UUID = Field(..., description="用户ID")
    version: int = Field(..., description="版本号")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    is_deleted: bool = Field(..., description="是否删除")
