"""
IM Gateway Router

端点:
- WS   /im/gateway                          桥接 WebSocket 连接
- POST /sessions/{session_id}/messages/send  通过桥接发送消息
- GET  /im/gateway/status                    活跃连接状态
"""
import asyncio
from uuid import UUID

from fastapi import (
    APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query,
)
from sqlalchemy.orm import Session as DBSession
from loguru import logger

from app.db.session import get_db, SessionLocal
from app.db.model.session import Session as SessionModel
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_sender import MessageSender
from app.db.model.user import User
from app.deps import get_current_user_flexible
from app.service.auth import TokenService, AuthService
from app.service.webhook import WebhookService
from app.service.im_connection import im_connection_manager
from app.schema.webhook import IMMessageWebhookRequest
from app.schema.im_gateway import (
    SendMessageRequest,
    SendMessageResponse,
    IMGatewayStatus,
)
from app.constants.message import MessageRole
from app.config import config


router = APIRouter()


# ============================================================
# WebSocket 认证
# ============================================================

async def _authenticate_ws(websocket: WebSocket, db: DBSession) -> User | None:
    """
    WebSocket 认证，支持 JWT 和 API Key。
    复用 get_current_user_flexible 的逻辑，适配 query params 传参。
    """
    if config.DEBUG:
        from app.deps import DEBUG_USER
        return DEBUG_USER

    token = websocket.query_params.get("token")
    if not token:
        return None

    try:
        if token.startswith("sk-"):
            from app.service.api_key import ApiKeyService
            return ApiKeyService.verify_api_key(db, token)
        else:
            payload = TokenService.decode_token(token)
            if not payload or payload.get("type") != "access":
                return None
            user_id_str = payload.get("sub")
            if not user_id_str:
                return None
            return AuthService.get_user_by_id(db, UUID(user_id_str))
    except Exception:
        return None


# ============================================================
# WebSocket 端点
# ============================================================

@router.websocket("/im/gateway")
async def im_gateway_ws(
    websocket: WebSocket,
    source: str = Query(..., description="IM 平台标识，如 astr_qq"),
):
    """
    IM 桥接 WebSocket 端点。

    Query Params:
        token: JWT 或 API Key (sk-xxx)
        source: IM 平台标识

    Bridge → Server:
        {"type": "message", "data": {...}}  转发 IM 消息
        {"type": "result", "request_id": "...", "success": true/false, ...}
        {"type": "ping"}

    Server → Bridge:
        {"type": "send_message", "request_id": "...", "session_id": "...", ...}
        {"type": "pong"}
    """
    await websocket.accept()
    db = SessionLocal()
    user = None

    try:
        # 认证
        user = await _authenticate_ws(websocket, db)
        if user is None:
            await websocket.close(code=4001, reason="Authentication failed")
            return

        # 注册连接
        await im_connection_manager.connect(user.id, source, websocket)

        # 主消息循环
        while True:
            raw = await websocket.receive_json()
            msg_type = raw.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "message":
                # 收到 IM 消息，复用 WebhookService 处理
                await _handle_incoming_message(raw.get("data", {}), user.id, source)

            elif msg_type == "result":
                # 桥接回报发送结果
                request_id = raw.get("request_id")
                if request_id:
                    resolved = im_connection_manager.resolve_request(
                        request_id,
                        {
                            "success": raw.get("success", False),
                            "data": raw.get("data"),
                            "error": raw.get("error"),
                        },
                    )
                    if not resolved:
                        logger.warning(f"No pending request: {request_id}")
                else:
                    logger.warning("Received result without request_id")

            else:
                logger.warning(f"Unknown WS message type: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"IM bridge disconnected: source={source}")
    except Exception as e:
        logger.error(f"IM gateway error: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if user is not None:
            await im_connection_manager.disconnect(user.id, source)
        db.close()


async def _handle_incoming_message(data: dict, user_id: UUID, source: str) -> None:
    """
    处理桥接转发的 IM 消息。
    独立 DB session，不阻塞 WS 主循环。
    """
    db = SessionLocal()
    try:
        if "source" not in data:
            data["source"] = source

        webhook_data = IMMessageWebhookRequest(**data)
        result = WebhookService.process_im_message(
            db=db,
            webhook_data=webhook_data,
            user_id=user_id,
        )
        db.commit()
        logger.info(f"WS incoming message processed: {result}")
    except Exception as e:
        logger.error(f"Error processing WS message: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


# ============================================================
# REST: 发送消息
# ============================================================

@router.post(
    "/sessions/{session_id}/messages/send",
    response_model=SendMessageResponse,
    summary="通过桥接发送消息到 IM 平台",
    description="""
    流程:
    1. 查找 Session 确定 source 和 external_id
    2. 检查对应桥接是否在线
    3. 存储消息到 DB (role=self)
    4. 通过 WebSocket 发送到桥接，等待投递结果
    """,
)
async def send_message(
    session_id: UUID,
    request: SendMessageRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible),
):
    # 1. 查找 Session
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id,
        SessionModel.is_deleted == False,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.source:
        raise HTTPException(status_code=400, detail="Session has no IM source")
    if not session.external_id:
        raise HTTPException(status_code=400, detail="Session has no external_id")

    # 2. 检查桥接是否在线
    if not im_connection_manager.is_connected(current_user.id, session.source):
        raise HTTPException(
            status_code=503,
            detail=f"No active bridge for source={session.source}",
        )

    # 3. 存储消息 (role=self)
    sender = db.query(MessageSender).filter(MessageSender.name == "self").first()
    if not sender:
        sender = MessageSender(name="self")
        db.add(sender)
        db.flush()

    message = Message(
        user_id=current_user.id,
        session_id=session.id,
        sender_id=sender.id,
        role=MessageRole.SELF,
    )
    db.add(message)
    db.flush()

    for part_data in request.message:
        part = MessagePart(
            message_id=message.id,
            type=part_data.get("type", "text"),
            content=part_data.get("text", part_data.get("content", "")),
            raw_data=part_data,
        )
        db.add(part)

    db.commit()

    # 4. 通过桥接发送
    try:
        bridge_result = await im_connection_manager.send_to_bridge(
            user_id=current_user.id,
            source=session.source,
            session_id=session.external_id,
            message=request.message,
            message_str=request.message_str,
            timeout=30.0,
        )
        return SendMessageResponse(
            success=bridge_result.get("success", False),
            message_id=str(message.id),
            bridge_result=bridge_result.get("data"),
            error=bridge_result.get("error"),
        )
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))


# ============================================================
# REST: 状态查询
# ============================================================

@router.get(
    "/im/gateway/status",
    response_model=IMGatewayStatus,
    summary="IM Gateway 状态",
)
async def gateway_status(
    current_user: User = Depends(get_current_user_flexible),
):
    return IMGatewayStatus(
        active_connections=im_connection_manager.active_connections,
    )
