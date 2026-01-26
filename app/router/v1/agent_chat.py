"""
Agent Chat API endpoints.

Provides:
- POST /sessions/{session_id}/chat - SSE streaming chat
- POST /sessions/{session_id}/chat/stop - Stop generation
- WS /sessions/{session_id}/chat/ws - WebSocket chat
"""

import asyncio
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.db.session import get_db
from app.db.model import Session as SessionModel, Agent, Topic, Message, MessagePart
from app.deps import get_current_user
from app.db.model.user import User
from app.schema.agent_chat import (
    ChatRequest,
    ChatResponse,
    StopRequest,
    StopResponse,
    WSIncomingMessage,
)
from app.agent import AgentFactory
from app.service.session import TopicService, MessageService
from app.service.auth import TokenService


router = APIRouter()

# Store active generation tasks for cancellation
_active_tasks: dict[str, asyncio.Task] = {}


async def _validate_session_for_agent(
    session_id: UUID,
    db: Session,
    user_id: UUID,
) -> tuple[SessionModel, Agent]:
    """
    Validate session exists, belongs to user, and has an agent.

    Returns:
        Tuple of (session, agent)

    Raises:
        HTTPException if validation fails
    """
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == user_id,
        SessionModel.is_deleted == False,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.type != "ai":
        raise HTTPException(
            status_code=400,
            detail="Session is not an AI session"
        )

    if not session.agent_id:
        raise HTTPException(
            status_code=400,
            detail="Session has no associated agent"
        )

    agent = db.query(Agent).filter(
        Agent.id == session.agent_id,
        Agent.is_deleted == False,
    ).first()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return session, agent


async def _get_or_create_topic(
    db: Session,
    user_id: UUID,
    session_id: UUID,
    topic_id: Optional[UUID],
    message: str,
) -> Topic:
    """
    Get existing topic or create new one.

    Args:
        db: Database session
        user_id: User ID
        session_id: Session ID
        topic_id: Optional topic ID
        message: User message for generating topic name

    Returns:
        Topic instance
    """
    if topic_id:
        topic = db.query(Topic).filter(
            Topic.id == topic_id,
            Topic.session_id == session_id,
            Topic.user_id == user_id,
            Topic.is_deleted == False,
        ).first()

        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")

        return topic

    # Create new topic with message preview as name
    topic_name = message[:30] + "..." if len(message) > 30 else message
    topic = Topic(
        user_id=user_id,
        session_id=session_id,
        name=topic_name,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)

    return topic


async def _save_message(
    db: Session,
    user_id: UUID,
    topic_id: UUID,
    role: str,
    content: str,
    metadata: Optional[dict] = None,
) -> Message:
    """
    Save a message to the database.

    Args:
        db: Database session
        user_id: User ID
        topic_id: Topic ID
        role: Message role (user/assistant)
        content: Message content
        metadata: Optional metadata

    Returns:
        Message instance
    """
    # Get session_id from topic
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    message = Message(
        user_id=user_id,
        session_id=topic.session_id,
        topic_id=topic_id,
        role=role,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Create message part
    part = MessagePart(
        message_id=message.id,
        type="text",
        content=content,
        metadata_=metadata or {},
    )
    db.add(part)
    db.commit()

    return message


@router.post("/sessions/{session_id}/chat")
async def chat_with_agent(
    session_id: UUID,
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Chat with an AI agent.

    Supports both streaming (SSE) and non-streaming responses.

    SSE Events:
    - message: Text content chunk
    - tool_call: Tool invocation
    - tool_result: Tool execution result
    - done: Stream complete
    - error: Error occurred
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Chat request received for session {session_id}")
    
    # Validate session and get agent
    session, agent = await _validate_session_for_agent(
        session_id, db, current_user.id
    )
    
    logger.info(f"Session validated, agent_id: {agent.id}")

    # Get or create topic
    topic = await _get_or_create_topic(
        db, current_user.id, session_id, request.topic_id, request.message
    )
    
    logger.info(f"Topic ready: {topic.id}")

    # Save user message
    await _save_message(
        db, current_user.id, topic.id, "user", request.message
    )
    
    logger.info("User message saved")

    # Get agent service with proper config
    agent_config = AgentFactory.build_agent_config(agent)
    logger.info(f"Getting agent service with config: {agent_config}")
    
    agent_service = await AgentFactory.get_agent(agent.id, agent_config)
    
    logger.info("Agent service obtained")

    # Thread ID for conversation continuity
    thread_id = f"topic_{topic.id}"

    if not request.stream:
        # Non-streaming response
        logger.info("Non-streaming mode")
        response_text = await agent_service.chat(
            request.message,
            thread_id=thread_id,
            user_id=current_user.id,
            session_id=session_id,
        )

        # Save AI message
        ai_message = await _save_message(
            db, current_user.id, topic.id, "assistant", response_text
        )

        return ChatResponse(
            message=response_text,
            session_id=session_id,
            topic_id=topic.id,
            message_id=ai_message.id,
        )

    # Streaming response - need to create new db session for async generator
    logger.info("Streaming mode - creating generator")
    
    async def generate_events():
        from app.db.session import SessionLocal
        import logging
        
        logger = logging.getLogger(__name__)
        task_key = f"{session_id}:{topic.id}"
        full_response = []
        # Create a new db session for the generator
        db_stream = SessionLocal()

        try:
            # Store task for potential cancellation
            current_task = asyncio.current_task()
            _active_tasks[task_key] = current_task

            logger.info(f"Starting chat stream for {task_key}")

            async for event in agent_service.chat_stream(
                request.message,
                thread_id=thread_id,
                user_id=current_user.id,
                session_id=session_id,
            ):
                event_type = event.get("event")
                event_data = event.get("data", {})

                logger.debug(f"Agent event: {event_type}, data: {event_data}")

                # Collect response text
                if event_type == "message":
                    full_response.append(event_data.get("content", ""))

                # Yield SSE event - must be a dict with 'data' key for sse-starlette
                yield {
                    "event": event_type,
                    "data": json.dumps(event_data),
                }

            logger.info(f"Chat stream completed for {task_key}, saving message")

            # Save complete AI message with the new db session
            if full_response:
                await _save_message(
                    db_stream,
                    current_user.id,
                    topic.id,
                    "assistant",
                    "".join(full_response),
                )
                logger.info(f"Message saved for {task_key}")

        except asyncio.CancelledError:
            logger.info(f"Chat generation cancelled for {task_key}")
            # Handle cancellation
            if full_response:
                await _save_message(
                    db_stream,
                    current_user.id,
                    topic.id,
                    "assistant",
                    "".join(full_response) + " [已取消]",
                    {"cancelled": True},
                )
            yield {
                "event": "done",
                "data": json.dumps({"status": "cancelled"}),
            }
        except Exception as e:
            logger.error(f"Error in chat stream for {task_key}: {str(e)}", exc_info=True)
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

        finally:
            _active_tasks.pop(task_key, None)
            db_stream.close()
            logger.info(f"Chat stream cleanup completed for {task_key}")

    logger.info("Returning EventSourceResponse")
    return EventSourceResponse(generate_events())


@router.post("/sessions/{session_id}/chat/stop")
async def stop_generation(
    session_id: UUID,
    topic_id: UUID = Query(..., description="Topic ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stop an ongoing generation.
    """
    # Validate session ownership
    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.user_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    task_key = f"{session_id}:{topic_id}"
    task = _active_tasks.get(task_key)

    if task and not task.done():
        task.cancel()
        return StopResponse(success=True, message="Generation stopped")

    return StopResponse(success=False, message="No active generation found")


@router.websocket("/sessions/{session_id}/chat/ws")
async def chat_websocket(
    websocket: WebSocket,
    session_id: UUID,
):
    """
    WebSocket endpoint for real-time chat.

    Client -> Server messages:
    - {"type": "message", "content": "...", "topic_id": "..."}
    - {"type": "stop"}

    Server -> Client messages:
    - {"type": "chunk", "content": "..."}
    - {"type": "tool_call", "name": "...", "args": {...}}
    - {"type": "tool_result", "name": "...", "result": "..."}
    - {"type": "done"}
    - {"type": "error", "message": "..."}
    - {"type": "stopped"}
    """
    from app.db.session import SessionLocal
    
    await websocket.accept()
    db = SessionLocal()

    try:
        # Get token from query params
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Missing token")
            return

        # Validate token and get user
        try:
            payload = TokenService.decode_token(token)
            if not payload or payload.get("type") != "access":
                await websocket.close(code=4001, reason="Invalid token")
                return
            user_id = UUID(payload.get("sub"))
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return

        # Validate session
        session, agent = await _validate_session_for_agent(
            session_id, db, user_id
        )

        agent_config = AgentFactory.build_agent_config(agent)
        agent_service = await AgentFactory.get_agent(agent.id, agent_config)

        current_task: Optional[asyncio.Task] = None

        while True:
            # Receive message
            data = await websocket.receive_json()
            msg = WSIncomingMessage(**data)

            if msg.type == "stop":
                if current_task and not current_task.done():
                    current_task.cancel()
                    await websocket.send_json({"type": "stopped"})
                continue

            if msg.type == "message" and msg.content:
                # Get or create topic
                topic = await _get_or_create_topic(
                    db, user_id, session_id, msg.topic_id, msg.content
                )

                # Save user message
                await _save_message(
                    db, user_id, topic.id, "user", msg.content
                )

                thread_id = f"topic_{topic.id}"
                full_response = []

                async def stream_to_ws():
                    nonlocal full_response
                    try:
                        async for event in agent_service.chat_stream(
                            msg.content,
                            thread_id=thread_id,
                            user_id=user_id,
                            session_id=session_id,
                        ):
                            event_type = event.get("event")
                            event_data = event.get("data", {})

                            if event_type == "message":
                                content = event_data.get("content", "")
                                full_response.append(content)
                                await websocket.send_json({
                                    "type": "chunk",
                                    "content": content,
                                })

                            elif event_type == "tool_call":
                                await websocket.send_json({
                                    "type": "tool_call",
                                    "name": event_data.get("name"),
                                    "args": event_data.get("args"),
                                })

                            elif event_type == "tool_result":
                                await websocket.send_json({
                                    "type": "tool_result",
                                    "name": event_data.get("name"),
                                    "result": event_data.get("result"),
                                })

                            elif event_type == "done":
                                await websocket.send_json({"type": "done"})

                            elif event_type == "error":
                                await websocket.send_json({
                                    "type": "error",
                                    "message": event_data.get("error"),
                                })

                        # Save complete response
                        if full_response:
                            await _save_message(
                                db, user_id, topic.id,
                                "assistant", "".join(full_response)
                            )

                    except asyncio.CancelledError:
                        if full_response:
                            await _save_message(
                                db, user_id, topic.id,
                                "assistant",
                                "".join(full_response) + " [已取消]",
                                {"cancelled": True},
                            )

                current_task = asyncio.create_task(stream_to_ws())
                await current_task

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except Exception:
            pass
    finally:
        db.close()
