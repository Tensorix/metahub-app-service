# app/scheduler/tasks/send_message.py

"""Scheduled task handler: send a message to a specified session.

For ai sessions: creates an assistant message (role=assistant).
For pm/group sessions: creates a self message and sends via IM bridge.
"""

from typing import Optional
from uuid import UUID

from loguru import logger
from sqlalchemy.orm import Session

from app.constants.message import MessagePartType, MessageRole
from app.db.model.agent import Agent
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_sender import MessageSender
from app.db.model.session import Session as SessionModel
from app.db.model.topic import Topic
from app.scheduler.registry import register_handler
from app.service.im_connection import im_connection_manager
from app.utils.message_utils import parts_to_message_str


@register_handler("send_message")
async def handle_send_message(task, db: Session) -> None:
    """
    Send a message to a specified session on schedule.

    task_params:
        session_id: str (required) - target session UUID
        content: str (required) - message text content
        topic_id: str (optional) - for ai sessions, specific topic; if omitted, use latest or create
    """
    params = task.task_params or {}
    session_id_str = params.get("session_id")
    content = params.get("content") or ""
    topic_id_str = params.get("topic_id")

    user_id = task.user_id
    if not user_id:
        raise ValueError("Scheduled task has no user_id")

    if not session_id_str:
        raise ValueError("task_params.session_id is required")
    if not content or not str(content).strip():
        raise ValueError("task_params.content is required and must be non-empty")

    try:
        session_id = UUID(session_id_str)
    except (TypeError, ValueError):
        raise ValueError(f"task_params.session_id must be a valid UUID, got {session_id_str!r}")

    topic_id = None
    if topic_id_str:
        try:
            topic_id = UUID(topic_id_str)
        except (TypeError, ValueError):
            pass

    # Load session (must belong to task user)
    session = (
        db.query(SessionModel)
        .filter(
            SessionModel.id == session_id,
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == False,
        )
        .first()
    )

    if not session:
        raise ValueError(f"Session {session_id} not found or does not belong to user")

    session_type = session.type or ""

    if session_type == "ai":
        await _send_ai_message(db, user_id, session_id, session.agent_id, topic_id, content)
    elif session_type in ("pm", "group"):
        await _send_im_message(db, user_id, session, content)
    else:
        raise ValueError(
            f"Session type {session_type!r} is not supported for scheduled send_message; "
            "use ai, pm, or group"
        )

    logger.info(f"Send_message task {task.id}: sent to session {session_id} ({session_type})")


async def _send_ai_message(
    db: Session,
    user_id: UUID,
    session_id: UUID,
    agent_id: Optional[UUID],
    topic_id: Optional[UUID],
    content: str,
) -> None:
    """Create assistant message for AI session and sync to LLM checkpointer."""
    topic = _get_or_create_topic_for_scheduled(db, user_id, session_id, topic_id, content)

    parts_data = [
        {
            "type": MessagePartType.TEXT,
            "content": content,
            "metadata_": {"scheduled": True},
        }
    ]
    message_str = parts_to_message_str(parts_data)

    message = Message(
        user_id=user_id,
        session_id=session_id,
        topic_id=topic.id,
        role=MessageRole.ASSISTANT,
        message_str=message_str,
    )
    db.add(message)
    db.flush()

    for part_data in parts_data:
        part = MessagePart(
            message_id=message.id,
            type=part_data.get("type", MessagePartType.TEXT),
            content=part_data.get("content", ""),
            metadata_=part_data.get("metadata_", {}),
        )
        db.add(part)

    db.commit()
    logger.debug(f"Created assistant message {message.id} in topic {topic.id}")

    # Sync to LangGraph checkpointer so message appears in LLM context
    if agent_id:
        try:
            from app.agent import AgentFactory

            agent = (
                db.query(Agent)
                .filter(Agent.id == agent_id, Agent.is_deleted == False)
                .first()
            )
            if agent:
                agent_config = AgentFactory.build_agent_config(agent)
                agent_service = await AgentFactory.get_agent(agent_id, agent_config)
                thread_id = f"topic_{topic.id}"
                await agent_service.append_assistant_message(
                    thread_id=thread_id,
                    content=content,
                    user_id=user_id,
                )
        except Exception as e:
            logger.warning(
                f"Failed to sync scheduled message to checkpointer for topic {topic.id}: {e}"
            )


def _get_or_create_topic_for_scheduled(
    db: Session,
    user_id: UUID,
    session_id: UUID,
    topic_id: Optional[UUID],
    content: str,
) -> Topic:
    """Get existing topic or create new one for scheduled AI message."""
    if topic_id:
        topic = (
            db.query(Topic)
            .filter(
                Topic.id == topic_id,
                Topic.session_id == session_id,
                Topic.user_id == user_id,
                Topic.is_deleted == False,
            )
            .first()
        )
        if topic:
            return topic

    # Use latest topic by updated_at, or create new
    topic = (
        db.query(Topic)
        .filter(
            Topic.session_id == session_id,
            Topic.user_id == user_id,
            Topic.is_deleted == False,
        )
        .order_by(Topic.updated_at.desc())
        .first()
    )

    if topic:
        return topic

    name = content[:30] + "..." if len(content) > 30 else content
    topic = Topic(
        user_id=user_id,
        session_id=session_id,
        name=name or "定时消息",
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


async def _send_im_message(
    db: Session,
    user_id: UUID,
    session: SessionModel,
    content: str,
) -> None:
    """Create self message for pm/group session and send via IM bridge."""
    if not session.source or not session.external_id:
        raise ValueError(
            f"Session {session.id} (pm/group) has no source/external_id, cannot send via IM"
        )

    sender = db.query(MessageSender).filter(MessageSender.name == "self").first()
    if not sender:
        sender = MessageSender(name="self")
        db.add(sender)
        db.flush()

    message = Message(
        user_id=user_id,
        session_id=session.id,
        sender_id=sender.id,
        role=MessageRole.SELF,
    )
    db.add(message)
    db.flush()

    part = MessagePart(
        message_id=message.id,
        type=MessagePartType.TEXT,
        content=content,
        metadata_={"scheduled": True},
    )
    db.add(part)
    db.commit()

    if im_connection_manager.is_connected(user_id, session.source):
        try:
            message_payload = [{"type": "text", "text": content}]
            await im_connection_manager.send_to_bridge(
                user_id=user_id,
                source=session.source,
                session_id=session.external_id,
                message=message_payload,
                message_str=content,
                timeout=30.0,
            )
        except (ConnectionError, TimeoutError) as e:
            logger.warning(f"IM bridge send failed for session {session.id}: {e}")
            raise
    else:
        raise ValueError(
            f"No active bridge for source={session.source}; message saved to DB but not delivered"
        )
