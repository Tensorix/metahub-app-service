"""MCP Server 配置相关 Schema."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class McpServerBase(BaseModel):
    """MCP Server 配置基础 Schema."""

    name: str = Field(..., min_length=1, max_length=100, description="MCP Server 名称")
    description: Optional[str] = Field(None, description="描述")
    transport: str = Field(
        "http",
        description="传输协议 (http, sse, stdio)",
    )
    url: str = Field(..., min_length=1, max_length=500, description="MCP Server URL")
    headers: Optional[dict[str, str]] = Field(None, description="自定义 HTTP Headers")
    is_enabled: bool = Field(True, description="是否启用")
    sort_order: int = Field(0, description="排序权重")


class McpServerCreate(McpServerBase):
    """创建 MCP Server 请求."""

    pass


class McpServerUpdate(BaseModel):
    """更新 MCP Server 请求."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    transport: Optional[str] = Field(
        None, description="传输协议 (http, sse, stdio)"
    )
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    headers: Optional[dict[str, str]] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class McpServerResponse(McpServerBase):
    """MCP Server 响应."""

    id: UUID
    agent_id: UUID
    last_connected_at: Optional[datetime] = None
    last_error: Optional[str] = None
    cached_tools: Optional[list[dict]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("headers", mode="before")
    @classmethod
    def mask_sensitive_headers(cls, v):
        """脱敏处理 header 中的敏感值."""
        if not v:
            return v
        masked = {}
        sensitive_keys = {"authorization", "x-api-key", "api-key", "token"}
        for key, value in v.items():
            if key.lower() in sensitive_keys and len(value) > 8:
                masked[key] = value[:4] + "****" + value[-4:]
            else:
                masked[key] = value
        return masked


class McpServerTestRequest(BaseModel):
    """MCP Server 连接测试请求."""

    url: Optional[str] = Field(None, description="要测试的 URL（新建时使用）")
    transport: Optional[str] = Field(
        "http", description="传输协议 (http, sse, stdio)"
    )
    headers: Optional[dict[str, str]] = Field(None, description="自定义 Headers")
    server_id: Optional[UUID] = Field(
        None, description="已保存的 Server ID（使用其配置测试）"
    )


class McpServerTestResult(BaseModel):
    """MCP Server 连接测试结果."""

    success: bool
    message: str
    tools: Optional[list[dict]] = None
    latency_ms: Optional[float] = None
