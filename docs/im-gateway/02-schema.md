# Step 2: Schema 定义

**文件**: `app/schema/im_gateway.py`（新建）

## 职责

定义 WebSocket 协议消息格式和 REST API 的请求/响应模型。

## 实现

```python
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
```

## 协议消息格式参考

Schema 文件仅定义 REST API 模型。WebSocket 消息使用 JSON dict 处理（与 `agent_chat.py` 模式一致），协议格式如下：

### Bridge → Server

**转发 IM 消息**
```json
{
    "type": "message",
    "data": {
        "timestamp": 1706000000,
        "session_id": "qq_group_12345",
        "message_id": "msg_001",
        "session_type": "group",
        "source": "astr_qq",
        "sender": {"nickname": "张三", "user_id": "10001"},
        "self_id": "bot_001",
        "message_str": "明天下午三点开会",
        "message": [{"type": "text", "text": "明天下午三点开会"}],
        "group": {"group_id": "12345", "group_name": "工作群"}
    }
}
```

> `data` 字段与 `IMMessageWebhookRequest` 完全同构，桥接可省略 `source`（从连接参数推断）。

**发送结果回报**
```json
{
    "type": "result",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "success": true,
    "data": {"message_id": "platform_msg_123"}
}
```

```json
{
    "type": "result",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "success": false,
    "error": "群聊已被解散"
}
```

**心跳**
```json
{"type": "ping"}
```

### Server → Bridge

**请求发送消息**
```json
{
    "type": "send_message",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "qq_group_12345",
    "message": [{"type": "text", "text": "收到，我会准时参加"}],
    "message_str": "收到，我会准时参加"
}
```

**心跳回复**
```json
{"type": "pong"}
```

## 设计说明

| 决策 | 理由 |
|------|------|
| WS 消息不用 Pydantic 模型做校验 | 与 `agent_chat.py` 保持一致，WS 消息用 dict 处理更灵活 |
| `data` 与 `IMMessageWebhookRequest` 同构 | 桥接端无需为 webhook 和 WS 维护两套数据格式 |
| `source` 可省略 | 连接时已通过 query param 声明 source，消息中可不重复 |
| `request_id` 使用 UUID | 全局唯一，避免冲突 |
