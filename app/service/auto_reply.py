"""Auto-Reply Service - 自动回复服务"""
import asyncio
from uuid import UUID
from loguru import logger

from app.db.session import SessionLocal
from app.db.model.session import Session as SessionModel
from app.db.model.agent import Agent
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_sender import MessageSender
from app.agent import AgentFactory
from app.service.im_connection import im_connection_manager
from app.constants.message import MessageRole


class AutoReplyService:
    """自动回复服务"""

    # 简单的 per-session 锁，防止同一会话并发自动回复
    _locks: dict[UUID, asyncio.Lock] = {}

    @classmethod
    def _get_lock(cls, session_id: UUID) -> asyncio.Lock:
        if session_id not in cls._locks:
            cls._locks[session_id] = asyncio.Lock()
        return cls._locks[session_id]

    @classmethod
    async def process(
        cls,
        session_id: UUID,
        user_id: UUID,
        incoming_message_str: str,
    ) -> None:
        """
        处理自动回复。

        Args:
            session_id: 会话 ID
            user_id: 用户 ID
            incoming_message_str: 收到的消息文本（用于传给 Agent）
        """
        lock = cls._get_lock(session_id)
        if lock.locked():
            logger.info(f"Auto-reply already in progress for session {session_id}, skipping")
            return

        async with lock:
            db = SessionLocal()
            try:
                await cls._do_reply(db, session_id, user_id, incoming_message_str)
            except Exception as e:
                logger.error(f"Auto-reply failed for session {session_id}: {e}", exc_info=True)
            finally:
                db.close()

    @classmethod
    async def _do_reply(
        cls,
        db,
        session_id: UUID,
        user_id: UUID,
        incoming_message_str: str,
    ) -> None:
        # 1. Load session
        session = db.query(SessionModel).filter(
            SessionModel.id == session_id,
            SessionModel.is_deleted == False,
        ).first()

        if not session or not session.auto_reply_enabled or not session.agent_id:
            return

        # 2. Load agent
        agent = db.query(Agent).filter(
            Agent.id == session.agent_id,
            Agent.is_deleted == False,
        ).first()

        if not agent:
            logger.warning(f"Auto-reply agent {session.agent_id} not found for session {session_id}")
            return

        # 3. Check bridge online
        if not session.source or not session.external_id:
            logger.warning(f"Session {session_id} has no source/external_id, cannot auto-reply")
            return

        if not im_connection_manager.is_connected(user_id, session.source):
            logger.warning(f"No bridge for source={session.source}, skipping auto-reply")
            return

        # 4. Build context from recent messages
        context_messages = cls._build_context(db, session_id)

        # 5. Invoke agent (non-streaming)
        agent_config = AgentFactory.build_agent_config(agent, db=db)
        agent_service = await AgentFactory.get_agent(agent.id, agent_config)

        # 使用 session_id 作为 thread_id，保持对话连续性
        thread_id = f"auto_reply_{session_id}"

        reply_text = await agent_service.chat(
            incoming_message_str,
            thread_id=thread_id,
            user_id=user_id,
            session_id=session_id,
        )

        if not reply_text or not reply_text.strip():
            logger.info(f"Agent returned empty reply for session {session_id}")
            return

        # 6. Store reply message (role=self)
        sender = db.query(MessageSender).filter(MessageSender.name == "self").first()
        if not sender:
            sender = MessageSender(name="self")
            db.add(sender)
            db.flush()

        message = Message(
            user_id=user_id,
            session_id=session_id,
            sender_id=sender.id,
            role=MessageRole.SELF,
        )
        db.add(message)
        db.flush()

        part = MessagePart(
            message_id=message.id,
            type="text",
            content=reply_text,
            metadata_={"auto_reply": True, "agent_id": str(agent.id)},
        )
        db.add(part)
        db.commit()

        logger.info(f"Auto-reply message stored: {message.id}")

        # 7. Send via bridge
        try:
            message_payload = [{"type": "text", "text": reply_text}]
            bridge_result = await im_connection_manager.send_to_bridge(
                user_id=user_id,
                source=session.source,
                session_id=session.external_id,
                message=message_payload,
                message_str=reply_text,
                timeout=30.0,
            )
            logger.info(f"Auto-reply sent via bridge: success={bridge_result.get('success')}")
        except (ConnectionError, TimeoutError) as e:
            logger.error(f"Auto-reply bridge send failed for session {session_id}: {e}")

    @classmethod
    def _build_context(cls, db, session_id: UUID, limit: int = 20) -> str:
        """构建对话上下文字符串，供 Agent 理解对话历史"""
        messages = db.query(Message).filter(
            Message.session_id == session_id,
            Message.is_deleted == False,
        ).order_by(Message.created_at.desc()).limit(limit).all()

        messages = list(reversed(messages))

        lines = []
        for msg in messages:
            sender_name = msg.sender.name if msg.sender else "Unknown"
            content_parts = []
            for part in msg.parts:
                if part.type == "text":
                    content_parts.append(part.content)
                elif part.type == "image":
                    content_parts.append("[图片]")
            content = " ".join(content_parts)
            lines.append(f"{sender_name}: {content}")

        return "\n".join(lines)
