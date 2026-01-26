# Step 3: API 端点实现

## 1. 目标

- 实现 SSE 流式聊天端点
- 实现 WebSocket 聊天端点
- 实现停止生成端点
- 定义请求/响应 Schema

## 2. 文件结构

```
app/
├── router/v1/
│   ├── __init__.py         # 添加 router 导入
│   └── agent_chat.py       # API 端点 (SSE + WebSocket)
└── schema/
    └── agent_chat.py       # 请求/响应模型
```

## 3. Schema 定义

### 3.1 app/schema/agent_chat.py

```python
"""
Agent Chat schemas - Request and response models.
"""

from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Chat request model."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="User message content"
    )
    topic_id: Optional[UUID] = Field(
        None,
        description="Topic ID, creates new if not provided"
    )
    stream: bool = Field(
        True,
        description="Whether to stream response"
    )


class ChatResponse(BaseModel):
    """Non-streaming chat response."""

    message: str = Field(..., description="AI response content")
    session_id: UUID = Field(..., description="Session ID")
    topic_id: UUID = Field(..., description="Topic ID")
    message_id: UUID = Field(..., description="AI message ID")


class StreamEvent(BaseModel):
    """SSE event model."""

    event: Literal["message", "tool_call", "tool_result", "done", "error"]
    data: dict


class StopRequest(BaseModel):
    """Stop generation request."""

    reason: Optional[str] = Field(None, description="Stop reason")


class StopResponse(BaseModel):
    """Stop generation response."""

    success: bool
    message: str


# WebSocket message types
class WSIncomingMessage(BaseModel):
    """WebSocket incoming message."""

    type: Literal["message", "stop"]
    content: Optional[str] = None
    topic_id: Optional[UUID] = None


class WSOutgoingMessage(BaseModel):
    """WebSocket outgoing message."""

    type: Literal["chunk", "tool_call", "tool_result", "done", "error", "stopped"]
    content: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict] = None
    result: Optional[str] = None
    message: Optional[str] = None
```

## 4. API 端点实现

### 4.1 app/router/v1/agent_chat.py

```python
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

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.db import get_db
from app.db.model import Session as SessionModel, Agent, Topic, Message, MessagePart
from app.auth import get_current_user, User
from app.schema.agent_chat import (
    ChatRequest,
    ChatResponse,
    StopRequest,
    StopResponse,
    WSIncomingMessage,
)
from app.agent import AgentFactory
from app.service.topic import TopicService
from app.service.message import MessageService

import uuid7

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
            Topic.is_deleted == False,
        ).first()

        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")

        return topic

    # Create new topic with message preview as name
    topic_name = message[:30] + "..." if len(message) > 30 else message
    topic = Topic(
        id=uuid7.create(),
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
    message = Message(
        id=uuid7.create(),
        user_id=user_id,
        topic_id=topic_id,
        role=role,
        metadata_=metadata or {},
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Create message part
    part = MessagePart(
        id=uuid7.create(),
        user_id=user_id,
        message_id=message.id,
        type="text",
        content=content,
        order=0,
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
    # Validate session and get agent
    session, agent = await _validate_session_for_agent(
        session_id, db, current_user.id
    )

    # Get or create topic
    topic = await _get_or_create_topic(
        db, current_user.id, session_id, request.topic_id, request.message
    )

    # Save user message
    await _save_message(
        db, current_user.id, topic.id, "user", request.message
    )

    # Get agent service
    agent_config = agent.metadata_ or {}
    agent_service = await AgentFactory.get_agent(agent.id, agent_config)

    # Thread ID for conversation continuity
    thread_id = f"topic_{topic.id}"

    if not request.stream:
        # Non-streaming response
        response_text = await agent_service.chat(
            request.message,
            thread_id=thread_id,
            user_id=current_user.id,
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

    # Streaming response
    async def generate_events():
        task_key = f"{session_id}:{topic.id}"
        full_response = []

        try:
            # Store task for potential cancellation
            current_task = asyncio.current_task()
            _active_tasks[task_key] = current_task

            async for event in agent_service.chat_stream(
                request.message,
                thread_id=thread_id,
                user_id=current_user.id,
            ):
                event_type = event.get("event")
                event_data = event.get("data", {})

                # Collect response text
                if event_type == "message":
                    full_response.append(event_data.get("content", ""))

                # Yield SSE event
                yield {
                    "event": event_type,
                    "data": json.dumps(event_data),
                }

            # Save complete AI message
            if full_response:
                await _save_message(
                    db,
                    current_user.id,
                    topic.id,
                    "assistant",
                    "".join(full_response),
                )

        except asyncio.CancelledError:
            # Handle cancellation
            if full_response:
                await _save_message(
                    db,
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

        finally:
            _active_tasks.pop(task_key, None)

    return EventSourceResponse(generate_events())


@router.post("/sessions/{session_id}/chat/stop")
async def stop_generation(
    session_id: UUID,
    topic_id: UUID,
    request: StopRequest,
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
    db: Session = Depends(get_db),
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
    await websocket.accept()

    try:
        # Get token from query params
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Missing token")
            return

        # Validate token and get user
        from app.auth import decode_token
        try:
            payload = decode_token(token)
            user_id = UUID(payload.get("sub"))
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return

        # Validate session
        session, agent = await _validate_session_for_agent(
            session_id, db, user_id
        )

        agent_config = agent.metadata_ or {}
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
```

### 4.2 更新 app/router/v1/__init__.py

```python
from fastapi import APIRouter
from .experimental import router as experimental_router
from .activity import router as activity_router
from .event import router as event_router
from .session import router as session_router
from .auth import router as auth_router
from .sync import router as sync_router
from .api_key import router as api_key_router
from .webhook import router as webhook_router
from .agent_chat import router as agent_chat_router  # 新增

router = APIRouter()
router.include_router(experimental_router, prefix="", tags=["v1"])
router.include_router(activity_router, prefix="", tags=["activities"])
router.include_router(event_router, prefix="", tags=["events"])
router.include_router(session_router, prefix="", tags=["sessions"])
router.include_router(auth_router, prefix="", tags=["auth"])
router.include_router(sync_router, prefix="", tags=["sync"])
router.include_router(api_key_router, prefix="", tags=["api-key"])
router.include_router(webhook_router, prefix="", tags=["webhooks"])
router.include_router(agent_chat_router, prefix="", tags=["agent-chat"])  # 新增
```

## 5. API 规范

### 5.1 SSE 端点

**请求**：
```http
POST /api/v1/sessions/{session_id}/chat
Content-Type: application/json
Authorization: Bearer {token}

{
  "message": "Hello, how are you?",
  "topic_id": "uuid-optional",
  "stream": true
}
```

**SSE 响应**：
```
event: message
data: {"content": "Hello"}

event: message
data: {"content": "! I'm"}

event: tool_call
data: {"name": "search", "args": {"query": "weather"}}

event: tool_result
data: {"name": "search", "result": "Sunny, 25°C"}

event: message
data: {"content": " doing great!"}

event: done
data: {"status": "complete"}
```

### 5.2 WebSocket 端点

**连接**：
```
ws://host/api/v1/sessions/{session_id}/chat/ws?token={jwt_token}
```

**客户端消息**：
```json
{"type": "message", "content": "Hello", "topic_id": "uuid-optional"}
{"type": "stop"}
```

**服务端消息**：
```json
{"type": "chunk", "content": "Hello"}
{"type": "tool_call", "name": "search", "args": {"query": "..."}}
{"type": "tool_result", "name": "search", "result": "..."}
{"type": "done"}
{"type": "error", "message": "..."}
{"type": "stopped"}
```

## 6. 错误处理

| 状态码 | 场景 | 响应 |
|--------|------|------|
| 400 | Session 非 AI 类型 | `{"detail": "Session is not an AI session"}` |
| 400 | Session 无 Agent | `{"detail": "Session has no associated agent"}` |
| 404 | Session 不存在 | `{"detail": "Session not found"}` |
| 404 | Topic 不存在 | `{"detail": "Topic not found"}` |
| 404 | Agent 不存在 | `{"detail": "Agent not found"}` |
| 500 | Agent 执行错误 | SSE: `event: error, data: {"error": "..."}` |

## 7. 测试

### 7.1 curl 测试 SSE

```bash
curl -N -X POST "http://localhost:8000/api/v1/sessions/{session_id}/chat" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "stream": true}'
```

### 7.2 wscat 测试 WebSocket

```bash
wscat -c "ws://localhost:8000/api/v1/sessions/{session_id}/chat/ws?token={jwt}"

> {"type": "message", "content": "Hello"}
< {"type": "chunk", "content": "Hi"}
< {"type": "chunk", "content": " there!"}
< {"type": "done"}

> {"type": "stop"}
< {"type": "stopped"}
```

## 8. 下一步

完成 API 端点后，进入 [04-BACKEND-TOOLS.md](./04-BACKEND-TOOLS.md) 实现自定义工具框架。
