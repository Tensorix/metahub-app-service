"""Search index schemas for API responses."""

from typing import Optional
from pydantic import BaseModel, Field


class SearchIndexStatsResponse(BaseModel):
    """搜索索引统计响应"""
    total_indexed: int = Field(..., description="总索引数")
    embedding_completed: int = Field(..., description="已完成 embedding 的数量")
    embedding_pending: int = Field(..., description="待处理 embedding 的数量")
    embedding_failed: int = Field(..., description="embedding 失败的数量")
    no_embedding: int = Field(..., description="无 embedding 的数量（仅文本索引）")


class SessionSearchIndexStatsResponse(BaseModel):
    """会话搜索索引统计响应"""
    session_id: str = Field(..., description="会话ID")
    total_messages: int = Field(..., description="会话总消息数")
    indexed_messages: int = Field(..., description="已索引消息数")
    embedding_completed: int = Field(..., description="已完成 embedding 的数量")
    no_embedding: int = Field(..., description="无 embedding 的数量")
    index_coverage: float = Field(..., description="索引覆盖率 (0-1)")


class ReindexRequest(BaseModel):
    """重建索引请求"""
    skip_embedding: bool = Field(
        False, 
        description="是否跳过 embedding 生成（只创建文本索引，节省 API 成本）"
    )
    regenerate_embeddings: bool = Field(
        False,
        description="是否重新生成已有索引的 embedding"
    )


class ReindexResponse(BaseModel):
    """重建索引响应"""
    status: str = Field(..., description="状态: started/completed/failed")
    total_messages: int = Field(..., description="总消息数")
    indexed_count: int = Field(..., description="成功索引数")
    skipped_count: int = Field(..., description="跳过数（已存在或内容为空）")
    failed_count: int = Field(..., description="失败数")
    error: Optional[str] = Field(None, description="错误信息")


class BackfillEmbeddingsRequest(BaseModel):
    """补建 embedding 请求"""
    batch_size: int = Field(50, ge=1, le=500, description="每批处理数量")


class BackfillEmbeddingsResponse(BaseModel):
    """补建 embedding 响应"""
    status: str = Field(..., description="状态: started/completed/failed")
    total_missing: int = Field(..., description="缺少 embedding 的索引数")
    processed: int = Field(..., description="已处理数")
    succeeded: int = Field(..., description="成功数")
    failed: int = Field(..., description="失败数")
    error: Optional[str] = Field(None, description="错误信息")
