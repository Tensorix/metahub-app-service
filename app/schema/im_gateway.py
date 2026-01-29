"""IM Gateway 协议 Schema"""
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ============================================================
# REST API 模型
# ============================================================

class SendMessageRequest(BaseModel):
    """POST /sessions/{session_id}/messages/send 请求体"""
    message: list[dict] = Field(
        ...,
        description="结构化消息，如 [{'type': 'text', 'text': 'hello'}]"
    )
    message_str: str = Field(
        ...,
        description="消息纯文本"
    )


class SendMessageResponse(BaseModel):
    """发送消息响应"""
    success: bool = Field(..., description="是否投递成功")
    message_id: Optional[str] = Field(None, description="内部消息 ID")
    bridge_result: Optional[dict] = Field(None, description="桥接返回的数据")
    error: Optional[str] = Field(None, description="错误信息")


class IMGatewayStatus(BaseModel):
    """网关状态"""
    active_connections: list[dict] = Field(..., description="活跃连接列表")
