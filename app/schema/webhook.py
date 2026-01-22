"""Webhook 相关的 Schema 定义"""
from typing import Optional, Any
from pydantic import BaseModel, Field


class IMMessageWebhookRequest(BaseModel):
    """
    IM 消息 Webhook 请求
    
    支持的 session_type:
    - pm: 私聊
    - group: 群聊
    - ai: AI 对话
    - 或其他自定义类型
    
    支持的 source (webhook 来源):
    - astr_qq: Astrbot QQ 插件
    - astr_wechat: Astrbot 微信插件
    - astr_telegram: Astrbot Telegram 插件
    - 或其他自定义来源
    
    支持的 message part type:
    - text: 文本消息
    - image: 图片消息
    - at: @某人
    - url: 链接
    - json: JSON 数据
    """
    timestamp: int = Field(..., description="消息时间戳")
    session_id: str = Field(..., description="会话ID")
    message_id: str = Field(..., description="消息ID")
    session_type: str = Field(..., description="会话类型: pm/group/ai 或其他自定义类型")
    source: str = Field(..., description="Webhook 来源: astr_qq/astr_wechat/astr_telegram 或其他自定义来源")
    sender: dict = Field(..., description="发送者信息")
    self_id: str = Field(..., description="机器人ID")
    message_str: str = Field(..., description="消息文本内容")
    message: list[dict] = Field(..., description="消息结构化内容，每个 part 需包含 type 字段 (text/image/at/url/json)")
    group: Optional[dict] = Field(None, description="群组信息（群消息时存在）")
    raw_message: Any = Field(None, description="原始消息数据")


class IMMessageWebhookResponse(BaseModel):
    """IM 消息 Webhook 响应"""
    status: str = Field(..., description="处理状态: accepted/processed")
    message: str = Field(..., description="响应消息")
    session_id: Optional[str] = Field(None, description="内部会话ID")
    message_id: Optional[str] = Field(None, description="内部消息ID")
    event_id: Optional[str] = Field(None, description="事件ID")
    activity_created: bool = Field(False, description="是否创建了 Activity")
    activity_id: Optional[str] = Field(None, description="Activity ID")
