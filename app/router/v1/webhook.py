"""Webhook 路由 - 处理外部系统的 webhook 回调"""
from fastapi import APIRouter, Depends, BackgroundTasks, status
from sqlalchemy.orm import Session
from loguru import logger

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user_flexible
from app.schema.webhook import IMMessageWebhookRequest, IMMessageWebhookResponse
from app.service.webhook import WebhookService


router = APIRouter(prefix="/webhooks")


def process_im_message_background(
    webhook_data: IMMessageWebhookRequest,
    user_id: str,
    db: Session
):
    """后台任务：处理 IM 消息"""
    try:
        from uuid import UUID
        result = WebhookService.process_im_message(
            db=db,
            webhook_data=webhook_data,
            user_id=UUID(user_id)
        )
        logger.info(f"Background task completed: {result}")
        db.commit()
    except Exception as e:
        logger.error(f"Background task failed: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


@router.post(
    "/im/message",
    response_model=IMMessageWebhookResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="IM 消息 Webhook",
    description="""
    接收 IM 消息的 webhook 回调
    
    认证方式：
    - JWT Token: 在 Authorization header 中传入 Bearer token
    - API Key: 在 Authorization header 中传入 Bearer sk-xxx
    
    支持的 session_type:
    - pm: 私聊
    - group: 群聊
    - ai: AI 对话
    - 或其他自定义类型（由上游系统定义）
    
    支持的 source (webhook 来源):
    - astr_qq: Astrbot QQ 插件
    - astr_wechat: Astrbot 微信插件
    - astr_telegram: Astrbot Telegram 插件
    - 或其他自定义来源（由上游系统定义）
    
    支持的 message part type:
    - text: 文本消息
    - image: 图片消息
    - at: @某人
    - url: 链接
    - json: JSON 数据
    
    处理流程：
    1. 接收消息后立即返回 202 Accepted
    2. 后台异步处理：
       - 创建/更新 Session 和 Message（直接使用上游提供的类型和来源，不做映射）
       - 获取会话上下文
       - 创建 Event
       - 使用 LangChain Agent 分析消息重要性
       - 如果重要，自动创建 Activity
    """
)
def receive_im_message(
    request: IMMessageWebhookRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible)
):
    """
    接收 IM 消息 webhook
    
    所有类型和来源字段由上游系统定义，本系统不做任何映射或转换
    """
    logger.info(f"Received IM message webhook: session_id={request.session_id}, message_id={request.message_id}, source={request.source}, type={request.session_type}")
    
    # 添加后台任务
    background_tasks.add_task(
        process_im_message_background,
        webhook_data=request,
        user_id=str(current_user.id),
        db=db
    )
    
    return IMMessageWebhookResponse(
        status="accepted",
        message="消息已接收，正在后台处理",
        session_id=None,
        message_id=None,
        event_id=None,
        activity_created=False,
        activity_id=None
    )
