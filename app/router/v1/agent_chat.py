"""
Agent Chat API endpoints.

Provides:
- POST /sessions/{session_id}/chat - SSE streaming chat
- POST /sessions/{session_id}/chat/stop - Stop generation
- WS /sessions/{session_id}/chat/ws - WebSocket chat
"""

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, List
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
from app.constants.message import MessagePartType
from app.utils.message_utils import parts_to_message_str


router = APIRouter()

# Store active generation tasks for cancellation
_active_tasks: dict[str, asyncio.Task] = {}


@dataclass
class StreamingPart:
    """流式过程中收集的 Part 数据"""
    type: str
    content: dict  # 原始数据，稍后序列化
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict = field(default_factory=dict)


@dataclass
class StreamingCollector:
    """收集流式事件的数据结构"""
    text_chunks: List[str] = field(default_factory=list)  # 当前累积的文本块
    text_parts: List[StreamingPart] = field(default_factory=list)  # 已完成的文本 parts
    thinking_chunks: List[str] = field(default_factory=list)
    tool_calls: List[StreamingPart] = field(default_factory=list)
    tool_results: List[StreamingPart] = field(default_factory=list)
    errors: List[StreamingPart] = field(default_factory=list)
    subagent_calls: List[StreamingPart] = field(default_factory=list)
    _active_operations: dict = field(default_factory=dict)  # op_id → operation info

    def flush_current_text(self):
        """将当前累积的 text_chunks 转换为一个独立的 text part"""
        if self.text_chunks:
            text_content = "".join(self.text_chunks)
            self.text_parts.append(StreamingPart(
                type=MessagePartType.TEXT,
                content={"text": text_content},
                metadata={"timestamp": datetime.now(timezone.utc).isoformat()}
            ))
            self.text_chunks = []  # 清空当前累积的 chunks

    def add_operation_start(
        self,
        op_id: str,
        op_type: str,
        name: str,
        args: Optional[dict] = None,
        description: str = "",
        started_at: Optional[str] = None,
    ):
        """记录操作开始。tool 立即落 tool_call，subagent 等待结束后落 subagent_call。"""
        self.flush_current_text()
        start_time = datetime.now(timezone.utc)
        if started_at:
            try:
                start_time = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            except ValueError:
                pass

        self._active_operations[op_id] = {
            "op_id": op_id,
            "op_type": op_type,
            "name": name,
            "args": args or {},
            "description": description,
            "start_time": start_time,
        }

        if op_type == "tool":
            self.tool_calls.append(StreamingPart(
                type=MessagePartType.TOOL_CALL,
                content={
                    "op_id": op_id,
                    "name": name,
                    "args": args or {},
                },
                metadata={"timestamp": start_time.isoformat()}
            ))

    def add_operation_end(
        self,
        op_id: str,
        op_type: Optional[str] = None,
        name: Optional[str] = None,
        result: str = "",
        success: bool = True,
        ended_at: Optional[str] = None,
        status: Optional[str] = None,
    ) -> dict:
        """记录操作结束。按 op_id 精确匹配开始事件。"""
        op = self._active_operations.pop(op_id, None)

        effective_type = op_type or (op.get("op_type") if op else "tool")
        effective_name = name or (op.get("name") if op else "unknown")
        effective_description = op.get("description", "") if op else ""
        start_time = op.get("start_time", datetime.now(timezone.utc)) if op else datetime.now(timezone.utc)
        end_time = datetime.now(timezone.utc)
        if ended_at:
            try:
                end_time = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
            except ValueError:
                pass
        duration = int((end_time - start_time).total_seconds() * 1000)
        effective_status = status or ("success" if success else "error")

        if effective_type == "subagent":
            payload = {
                "op_id": op_id,
                "op_type": effective_type,
                "name": effective_name,
                "description": effective_description,
                "result": result,
                "success": success,
                "duration_ms": max(0, duration),
                "status": effective_status,
            }
            self.subagent_calls.append(StreamingPart(
                type=MessagePartType.SUBAGENT_CALL,
                content=payload,
                metadata={"timestamp": end_time.isoformat()},
            ))
            return payload

        payload = {
            "op_id": op_id,
            "op_type": effective_type,
            "name": effective_name,
            "result": result,
            "success": success,
            "duration_ms": max(0, duration),
            "status": effective_status,
        }
        self.tool_results.append(StreamingPart(
            type=MessagePartType.TOOL_RESULT,
            content=payload,
            metadata={"timestamp": end_time.isoformat()}
        ))
        return payload

    def flush_active_operations(self, cancel_result: str = "[已取消]"):
        """流中断时，将所有未完成操作补充关闭。"""
        for op_id in list(self._active_operations.keys()):
            self.add_operation_end(op_id, result=cancel_result, success=False, status="cancelled")

    def add_error(self, error: str, code: Optional[str] = None, context: Optional[str] = None):
        """添加错误"""
        content = {"error": error}
        if code:
            content["code"] = code

        metadata = {"timestamp": datetime.now(timezone.utc).isoformat()}
        if context:
            metadata["context"] = context

        self.errors.append(StreamingPart(
            type=MessagePartType.ERROR,
            content=content,
            metadata=metadata
        ))

    def add_text(self, chunk: str):
        """添加文本片段"""
        self.text_chunks.append(chunk)

    def add_thinking(self, chunk: str):
        """添加思考内容片段"""
        self.thinking_chunks.append(chunk)

    def get_full_text(self) -> str:
        """获取完整文本"""
        return "".join(self.text_chunks)

    def get_full_thinking(self) -> str:
        """获取完整思考内容"""
        return "".join(self.thinking_chunks)

    def has_content(self) -> bool:
        """是否有任何内容"""
        return bool(
            self.text_chunks or
            self.text_parts or
            self.thinking_chunks or
            self.tool_calls or
            self.tool_results or
            self.subagent_calls or
            self.errors
        )

    def to_parts_data(self) -> List[dict]:
        """
        转换为 MessagePart 创建数据列表
        按时间顺序排列所有 parts：thinking -> text/tool_call/tool_result/subagent_call（交错）-> error
        """
        # 先 flush 最后剩余的文本
        self.flush_current_text()
        
        parts = []

        # 添加思考内容（如果有，放在最前面）
        full_thinking = self.get_full_thinking()
        if full_thinking:
            parts.append({
                "type": MessagePartType.THINKING,
                "content": full_thinking,
                "metadata_": {"timestamp": datetime.now(timezone.utc).isoformat()},
            })

        # 按时间顺序合并所有 parts（text, tool_call, tool_result, subagent_call）
        timed_parts = []

        for tp in self.text_parts:
            timed_parts.append((tp.timestamp, MessagePartType.TEXT, tp))

        for tc in self.tool_calls:
            timed_parts.append((tc.timestamp, MessagePartType.TOOL_CALL, tc))

        for tr in self.tool_results:
            timed_parts.append((tr.timestamp, MessagePartType.TOOL_RESULT, tr))

        for sa in self.subagent_calls:
            timed_parts.append((sa.timestamp, MessagePartType.SUBAGENT_CALL, sa))

        # 按时间排序
        timed_parts.sort(key=lambda x: x[0])

        # 添加排序后的所有 parts
        for _, part_type, part in timed_parts:
            if part_type == MessagePartType.TEXT:
                # text part 的 content 是 {"text": "..."} 格式，需要提取
                parts.append({
                    "type": part_type,
                    "content": part.content["text"],
                    "metadata_": part.metadata,
                })
            else:
                # 其他 part 的 content 需要 JSON 序列化
                parts.append({
                    "type": part_type,
                    "content": json.dumps(part.content),
                    "metadata_": part.metadata,
                })

        # 添加错误（如果有）
        for err in self.errors:
            parts.append({
                "type": MessagePartType.ERROR,
                "content": json.dumps(err.content),
                "metadata_": err.metadata,
            })

        return parts


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


async def _save_message_with_parts(
    db: Session,
    user_id: UUID,
    topic_id: UUID,
    role: str,
    parts_data: List[dict],
    message_metadata: Optional[dict] = None,
) -> Message:
    """
    保存消息及其多个 Parts

    Args:
        db: Database session
        user_id: User ID
        topic_id: Topic ID
        role: Message role (user/assistant)
        parts_data: List of part data dicts with keys: type, content, metadata_
        message_metadata: Optional message-level metadata

    Returns:
        Message instance with parts
    """
    # Get session_id from topic
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # 生成 message_str（纯文本，用于检索）
    message_str = parts_to_message_str(parts_data)

    # Create message
    message = Message(
        user_id=user_id,
        session_id=topic.session_id,
        topic_id=topic_id,
        role=role,
        message_str=message_str,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # Create message parts
    for part_data in parts_data:
        part = MessagePart(
            message_id=message.id,
            type=part_data.get("type", MessagePartType.TEXT),
            content=part_data.get("content", ""),
            metadata_=part_data.get("metadata_", {}),
        )
        db.add(part)

    db.commit()

    return message


async def _save_message(
    db: Session,
    user_id: UUID,
    topic_id: UUID,
    role: str,
    content: str,
    metadata: Optional[dict] = None,
) -> Message:
    """
    Save a message to the database (兼容旧接口).
    """
    parts_data = [{
        "type": MessagePartType.TEXT,
        "content": content,
        "metadata_": metadata or {},
    }]
    return await _save_message_with_parts(db, user_id, topic_id, role, parts_data)


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
    - operation_start: Tool/SubAgent invocation started
    - operation_end: Tool/SubAgent invocation completed
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
        
        # 使用 StreamingCollector 收集事件
        collector = StreamingCollector()
        
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
                event_loop_ms = int(time.perf_counter() * 1000)

                logger.debug(f"Agent event: {event_type}, data: {event_data}")
                if event_type in {"operation_start", "operation_end"}:
                    logger.debug(
                        "OP_TRACE source=agent_chat phase=ingress "
                        f"event={event_type} op_id={event_data.get('op_id')} "
                        f"op_type={event_data.get('op_type')} name={event_data.get('name')} "
                        f"event_loop_ms={event_loop_ms}"
                    )

                # 收集并转发事件
                if event_type == "message":
                    content = event_data.get("content", "")
                    collector.add_text(content)

                elif event_type == "thinking":
                    content = event_data.get("content", "")
                    collector.add_thinking(content)

                elif event_type == "operation_start":
                    collector.add_operation_start(
                        op_id=event_data.get("op_id", ""),
                        op_type=event_data.get("op_type", "tool"),
                        name=event_data.get("name", "unknown"),
                        args=event_data.get("args", {}),
                        description=event_data.get("description", ""),
                        started_at=event_data.get("started_at"),
                    )

                elif event_type == "operation_end":
                    end_payload = collector.add_operation_end(
                        op_id=event_data.get("op_id", ""),
                        op_type=event_data.get("op_type"),
                        name=event_data.get("name"),
                        result=event_data.get("result", ""),
                        success=event_data.get("success", True),
                        ended_at=event_data.get("ended_at"),
                        status=event_data.get("status"),
                    )
                    event_data.update(end_payload)

                elif event_type == "error":
                    error_msg = event_data.get("error", "Unknown error")
                    collector.add_error(error_msg, context="streaming")

                # Yield SSE event - must be a dict with 'data' key for sse-starlette
                if event_type in {"operation_start", "operation_end"}:
                    logger.debug(
                        "OP_TRACE source=agent_chat phase=egress_sse "
                        f"event={event_type} op_id={event_data.get('op_id')} "
                        f"op_type={event_data.get('op_type')} name={event_data.get('name')} "
                        f"event_loop_ms={int(time.perf_counter() * 1000)}"
                    )
                yield {
                    "event": event_type,
                    "data": json.dumps(event_data),
                }

            logger.info(f"Chat stream completed for {task_key}, saving message")

            # 保存完整的 AI 消息（包含所有 Parts）
            if collector.has_content():
                logger.info(f"Collector state: text_parts={len(collector.text_parts)}, "
                           f"tool_calls={len(collector.tool_calls)}, "
                           f"tool_results={len(collector.tool_results)}, "
                           f"subagent_calls={len(collector.subagent_calls)}")
                
                parts_data = collector.to_parts_data()
                
                # 调试：打印 parts 类型
                part_types = [p["type"] for p in parts_data]
                logger.info(f"Parts to save: {part_types}")
                
                await _save_message_with_parts(
                    db_stream,
                    current_user.id,
                    topic.id,
                    "assistant",
                    parts_data,
                )
                logger.info(f"Message saved with {len(parts_data)} parts for {task_key}")

            # 发送 done 事件
            yield {
                "event": "done",
                "data": json.dumps({"status": "complete"}),
            }

        except asyncio.CancelledError:
            logger.info(f"Chat generation cancelled for {task_key}")
            
            # 关闭所有未完成操作
            collector.flush_active_operations("[已取消]")
            
            # 保存已收集的内容（标记为已取消）
            if collector.has_content():
                # 添加取消标记到文本
                if collector.text_chunks:
                    collector.text_chunks.append(" [已取消]")

                parts_data = collector.to_parts_data()
                # 在最后一个 part 的 metadata 中添加 cancelled 标记
                if parts_data:
                    parts_data[-1]["metadata_"]["cancelled"] = True

                await _save_message_with_parts(
                    db_stream,
                    current_user.id,
                    topic.id,
                    "assistant",
                    parts_data,
                )

            yield {
                "event": "done",
                "data": json.dumps({"status": "cancelled"}),
            }

        except Exception as e:
            logger.error(f"Error in chat stream for {task_key}: {str(e)}", exc_info=True)
            
            # 保存已收集的内容 + 错误信息
            collector.add_error(str(e), context="fatal")

            if collector.has_content():
                parts_data = collector.to_parts_data()
                await _save_message_with_parts(
                    db_stream,
                    current_user.id,
                    topic.id,
                    "assistant",
                    parts_data,
                )

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
    - {"type": "operation_start", "op_type": "tool|subagent", "name": "..."}
    - {"type": "operation_end", "op_type": "tool|subagent", "result": "..."}
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
                
                # 使用 StreamingCollector
                collector = StreamingCollector()

                async def stream_to_ws():
                    nonlocal collector
                    try:
                        import logging
                        logger = logging.getLogger(__name__)

                        async for event in agent_service.chat_stream(
                            msg.content,
                            thread_id=thread_id,
                            user_id=user_id,
                            session_id=session_id,
                        ):
                            event_type = event.get("event")
                            event_data = event.get("data", {})
                            event_loop_ms = int(time.perf_counter() * 1000)
                            if event_type in {"operation_start", "operation_end"}:
                                logger.debug(
                                    "OP_TRACE source=agent_chat_ws phase=ingress "
                                    f"event={event_type} op_id={event_data.get('op_id')} "
                                    f"op_type={event_data.get('op_type')} name={event_data.get('name')} "
                                    f"event_loop_ms={event_loop_ms}"
                                )

                            if event_type == "message":
                                content = event_data.get("content", "")
                                collector.add_text(content)
                                await websocket.send_json({
                                    "type": "chunk",
                                    "content": content,
                                })

                            elif event_type == "thinking":
                                content = event_data.get("content", "")
                                collector.add_thinking(content)
                                await websocket.send_json({
                                    "type": "thinking",
                                    "content": content,
                                })

                            elif event_type == "operation_start":
                                collector.add_operation_start(
                                    op_id=event_data.get("op_id", ""),
                                    op_type=event_data.get("op_type", "tool"),
                                    name=event_data.get("name", "unknown"),
                                    args=event_data.get("args", {}),
                                    description=event_data.get("description", ""),
                                    started_at=event_data.get("started_at"),
                                )
                                logger.debug(
                                    "OP_TRACE source=agent_chat_ws phase=egress "
                                    f"event=operation_start op_id={event_data.get('op_id')} "
                                    f"op_type={event_data.get('op_type')} name={event_data.get('name')} "
                                    f"event_loop_ms={int(time.perf_counter() * 1000)}"
                                )
                                await websocket.send_json({
                                    "type": "operation_start",
                                    **event_data,
                                })

                            elif event_type == "operation_end":
                                end_payload = collector.add_operation_end(
                                    op_id=event_data.get("op_id", ""),
                                    op_type=event_data.get("op_type"),
                                    name=event_data.get("name"),
                                    result=event_data.get("result", ""),
                                    success=event_data.get("success", True),
                                    ended_at=event_data.get("ended_at"),
                                    status=event_data.get("status"),
                                )
                                logger.debug(
                                    "OP_TRACE source=agent_chat_ws phase=egress "
                                    f"event=operation_end op_id={event_data.get('op_id')} "
                                    f"op_type={event_data.get('op_type')} name={event_data.get('name')} "
                                    f"event_loop_ms={int(time.perf_counter() * 1000)}"
                                )
                                await websocket.send_json({
                                    "type": "operation_end",
                                    **event_data,
                                    **end_payload,
                                })

                            elif event_type == "done":
                                await websocket.send_json({"type": "done"})

                            elif event_type == "error":
                                error_msg = event_data.get("error", "")
                                collector.add_error(error_msg)
                                await websocket.send_json({
                                    "type": "error",
                                    "message": error_msg,
                                })

                        # 保存完整消息
                        if collector.has_content():
                            parts_data = collector.to_parts_data()
                            await _save_message_with_parts(
                                db, user_id, topic.id,
                                "assistant", parts_data
                            )

                    except asyncio.CancelledError:
                        # 关闭所有未完成操作
                        collector.flush_active_operations("[已取消]")
                        
                        if collector.has_content():
                            if collector.text_chunks:
                                collector.text_chunks.append(" [已取消]")
                            parts_data = collector.to_parts_data()
                            if parts_data:
                                parts_data[-1]["metadata_"]["cancelled"] = True
                            await _save_message_with_parts(
                                db, user_id, topic.id,
                                "assistant", parts_data
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
