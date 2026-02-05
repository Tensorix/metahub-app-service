# 后端改动

## 0. 数据库迁移

### 0.1 Message 表新增字段

**迁移文件**: `alembic/versions/xxx_add_message_str.py`

```python
"""Add message_str column to message table

Revision ID: xxx
"""

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column(
        'message',
        sa.Column(
            'message_str',
            sa.Text(),
            nullable=True,
            comment='消息纯文本内容，由 parts 合成，用于检索和统一处理'
        )
    )


def downgrade():
    op.drop_column('message', 'message_str')
```

### 0.2 Model 更新

**文件**: `app/db/model/message.py`

```python
from sqlalchemy import Text

class Message(Base):
    # ... 现有字段 ...

    message_str: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="消息纯文本内容，由 parts 合成，用于检索和统一处理"
    )
```

---

## 1. 工具函数

### 1.1 新增文件: `app/utils/message_utils.py`

```python
"""消息处理工具函数"""

import json
from typing import List, Optional


def parts_to_message_str(
    parts: List[dict],
    include_tool_info: bool = True,
    separator: str = "\n"
) -> str:
    """
    将 Parts 列表转换为纯文本字符串

    Args:
        parts: Part 数据列表，每个 dict 包含 type, content, metadata_
        include_tool_info: 是否包含工具调用信息，False 则只保留文本
        separator: 不同 part 之间的分隔符

    Returns:
        合成的纯文本字符串
    """
    segments = []

    for part in parts:
        part_type = part.get("type", "text")
        content = part.get("content", "")

        if part_type == "text":
            if content.strip():
                segments.append(content)

        elif part_type == "thinking" and include_tool_info:
            preview = content[:50] + "..." if len(content) > 50 else content
            segments.append(f"[思考: {preview}]")

        elif part_type == "tool_call" and include_tool_info:
            try:
                data = json.loads(content)
                name = data.get("name", "unknown")
                segments.append(f"[调用工具: {name}]")
            except json.JSONDecodeError:
                segments.append("[调用工具]")

        elif part_type == "tool_result" and include_tool_info:
            try:
                data = json.loads(content)
                name = data.get("name", "unknown")
                segments.append(f"[工具结果: {name}]")
            except json.JSONDecodeError:
                segments.append("[工具结果]")

        elif part_type == "error":
            try:
                data = json.loads(content)
                error = data.get("error", "未知错误")
                segments.append(f"[错误: {error}]")
            except json.JSONDecodeError:
                segments.append(f"[错误: {content}]")

        elif part_type == "image":
            segments.append("[图片]")

        elif part_type == "at":
            segments.append(f"@{content}")

        elif part_type == "url":
            segments.append(content)

        elif part_type == "json":
            segments.append("[JSON数据]")

    return separator.join(segments)


def get_text_only(parts: List[dict]) -> str:
    """
    只提取纯文本内容，忽略工具调用等

    Args:
        parts: Part 数据列表

    Returns:
        纯文本内容
    """
    return parts_to_message_str(parts, include_tool_info=False, separator="\n")
```

---

## 2. 常量定义更新

### 1.1 文件: `app/constants/message.py`

```python
"""Message 相关常量定义"""


class MessageRole:
    """消息角色常量"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    SELF = "self"
    NULL = "null"

    KNOWN_ROLES = frozenset({USER, ASSISTANT, SYSTEM, SELF, NULL})

    @classmethod
    def is_known(cls, role: str) -> bool:
        return role in cls.KNOWN_ROLES


class MessagePartType:
    """
    消息部分类型常量

    === 基础内容类型 ===
    TEXT: 纯文本内容
    IMAGE: 图片（base64 或 URL）
    AT: @提及
    URL: 链接
    JSON: 通用 JSON 数据

    === AI 对话扩展类型 ===
    TOOL_CALL: AI 工具调用请求
    TOOL_RESULT: 工具执行结果
    ERROR: 错误信息
    """

    # 基础类型
    TEXT = "text"
    IMAGE = "image"
    AT = "at"
    URL = "url"
    JSON = "json"

    # AI 对话扩展类型
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    THINKING = "thinking"

    KNOWN_TYPES = frozenset({
        TEXT, IMAGE, AT, URL, JSON,
        TOOL_CALL, TOOL_RESULT, ERROR, THINKING,
    })

    # AI 相关类型集合
    AI_TYPES = frozenset({TOOL_CALL, TOOL_RESULT, ERROR, THINKING})

    @classmethod
    def is_known(cls, type_: str) -> bool:
        return type_ in cls.KNOWN_TYPES

    @classmethod
    def is_ai_type(cls, type_: str) -> bool:
        return type_ in cls.AI_TYPES
```

---

## 2. agent_chat.py 改动

### 2.1 新增数据结构

```python
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime
import uuid


@dataclass
class StreamingPart:
    """流式过程中收集的 Part 数据"""
    type: str
    content: dict  # 原始数据，稍后序列化
    timestamp: datetime = field(default_factory=datetime.utcnow)
    metadata: dict = field(default_factory=dict)


@dataclass
class StreamingCollector:
    """收集流式事件的数据结构"""
    text_chunks: List[str] = field(default_factory=list)
    thinking_chunks: List[str] = field(default_factory=list)  # 思考内容
    tool_calls: List[StreamingPart] = field(default_factory=list)
    tool_results: List[StreamingPart] = field(default_factory=list)
    errors: List[StreamingPart] = field(default_factory=list)

    # call_id 计数器
    _call_counter: int = field(default=0)

    def generate_call_id(self) -> str:
        """生成唯一的 call_id"""
        self._call_counter += 1
        return f"call_{uuid.uuid4().hex[:8]}_{self._call_counter}"

    def add_tool_call(self, name: str, args: dict, call_id: Optional[str] = None) -> str:
        """添加工具调用，返回 call_id"""
        if call_id is None:
            call_id = self.generate_call_id()

        self.tool_calls.append(StreamingPart(
            type="tool_call",
            content={
                "call_id": call_id,
                "name": name,
                "args": args,
            },
            metadata={"timestamp": datetime.utcnow().isoformat()}
        ))
        return call_id

    def add_tool_result(self, name: str, result: str, call_id: str, success: bool = True):
        """添加工具结果"""
        self.tool_results.append(StreamingPart(
            type="tool_result",
            content={
                "call_id": call_id,
                "name": name,
                "result": result,
                "success": success,
            },
            metadata={"timestamp": datetime.utcnow().isoformat()}
        ))

    def add_error(self, error: str, code: Optional[str] = None, context: Optional[str] = None):
        """添加错误"""
        content = {"error": error}
        if code:
            content["code"] = code

        metadata = {"timestamp": datetime.utcnow().isoformat()}
        if context:
            metadata["context"] = context

        self.errors.append(StreamingPart(
            type="error",
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
            self.thinking_chunks or
            self.tool_calls or
            self.tool_results or
            self.errors
        )

    def to_parts_data(self) -> List[dict]:
        """
        转换为 MessagePart 创建数据列表
        按时间顺序排列：thinking -> tool_call -> tool_result -> text -> error
        """
        parts = []

        # 添加思考内容（如果有，放在最前面）
        full_thinking = self.get_full_thinking()
        if full_thinking:
            parts.append({
                "type": "thinking",
                "content": full_thinking,
                "metadata_": {"timestamp": datetime.utcnow().isoformat()},
            })

        # 按时间顺序合并 tool_call 和 tool_result
        # 使用 (timestamp, type, data) 排序
        timed_parts = []

        for tc in self.tool_calls:
            timed_parts.append((tc.timestamp, "tool_call", tc))

        for tr in self.tool_results:
            timed_parts.append((tr.timestamp, "tool_result", tr))

        # 按时间排序
        timed_parts.sort(key=lambda x: x[0])

        # 添加排序后的 tool_call/tool_result
        for _, part_type, part in timed_parts:
            parts.append({
                "type": part_type,
                "content": json.dumps(part.content),
                "metadata_": part.metadata,
            })

        # 添加文本（如果有）
        full_text = self.get_full_text()
        if full_text:
            parts.append({
                "type": "text",
                "content": full_text,
                "metadata_": {},
            })

        # 添加错误（如果有）
        for err in self.errors:
            parts.append({
                "type": "error",
                "content": json.dumps(err.content),
                "metadata_": err.metadata,
            })

        return parts
```

### 2.2 修改 `_save_message` 函数

```python
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
    from app.constants.message import MessagePartType
    from app.utils.message_utils import parts_to_message_str

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
        message_str=message_str,  # 新增：纯文本内容
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


# 保留原有函数签名以保持兼容
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
        "type": "text",
        "content": content,
        "metadata_": metadata or {},
    }]
    return await _save_message_with_parts(db, user_id, topic_id, role, parts_data)
```

### 2.3 修改 `generate_events` 流式处理

```python
async def generate_events():
    from app.db.session import SessionLocal
    from app.constants.message import MessagePartType
    import logging

    logger = logging.getLogger(__name__)
    task_key = f"{session_id}:{topic.id}"

    # 使用 StreamingCollector 收集事件
    collector = StreamingCollector()

    # 当前活动的 tool_call (用于关联 result)
    active_call_id: Optional[str] = None

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

            # 收集并转发事件
            if event_type == "message":
                content = event_data.get("content", "")
                collector.add_text(content)

            elif event_type == "thinking":
                content = event_data.get("content", "")
                collector.add_thinking(content)

            elif event_type == "tool_call":
                name = event_data.get("name", "")
                args = event_data.get("args", {})
                # 生成 call_id 并添加到事件数据中
                active_call_id = collector.add_tool_call(name, args)
                # 将 call_id 添加到转发的事件中
                event_data["call_id"] = active_call_id

            elif event_type == "tool_result":
                name = event_data.get("name", "")
                result = event_data.get("result", "")
                success = event_data.get("success", True)
                # 使用当前活动的 call_id
                if active_call_id:
                    collector.add_tool_result(name, result, active_call_id, success)
                    event_data["call_id"] = active_call_id
                    active_call_id = None  # 重置

            elif event_type == "error":
                error_msg = event_data.get("error", "Unknown error")
                collector.add_error(error_msg, context="streaming")

            # Yield SSE event
            yield {
                "event": event_type,
                "data": json.dumps(event_data),
            }

        logger.info(f"Chat stream completed for {task_key}, saving message")

        # 保存完整的 AI 消息（包含所有 Parts）
        if collector.has_content():
            parts_data = collector.to_parts_data()
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
```

---

## 3. WebSocket 处理同步修改

### 3.1 修改 `stream_to_ws` 函数

```python
async def stream_to_ws():
    nonlocal full_response

    # 使用 StreamingCollector
    collector = StreamingCollector()
    active_call_id: Optional[str] = None

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
                collector.add_text(content)
                full_response.append(content)
                await websocket.send_json({
                    "type": "chunk",
                    "content": content,
                })

            elif event_type == "tool_call":
                name = event_data.get("name", "")
                args = event_data.get("args", {})
                active_call_id = collector.add_tool_call(name, args)
                await websocket.send_json({
                    "type": "tool_call",
                    "name": name,
                    "args": args,
                    "call_id": active_call_id,
                })

            elif event_type == "tool_result":
                name = event_data.get("name", "")
                result = event_data.get("result", "")
                if active_call_id:
                    collector.add_tool_result(name, result, active_call_id)
                await websocket.send_json({
                    "type": "tool_result",
                    "name": name,
                    "result": result,
                    "call_id": active_call_id,
                })
                active_call_id = None

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
```

---

## 4. Schema 更新

### 4.1 文件: `app/schema/agent_chat.py`

```python
"""Agent Chat schemas - Request and response models."""

from typing import Optional, Literal, List
from uuid import UUID
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Chat request model."""
    message: str = Field(..., min_length=1, max_length=10000)
    topic_id: Optional[UUID] = None
    stream: bool = True


class ChatResponse(BaseModel):
    """Non-streaming chat response."""
    message: str
    session_id: UUID
    topic_id: UUID
    message_id: UUID


class StreamEvent(BaseModel):
    """SSE event model."""
    event: Literal["message", "tool_call", "tool_result", "done", "error"]
    data: dict


# 新增：详细的事件数据模型
class MessageEventData(BaseModel):
    """message 事件数据"""
    content: str


class ToolCallEventData(BaseModel):
    """tool_call 事件数据"""
    call_id: str
    name: str
    args: dict


class ToolResultEventData(BaseModel):
    """tool_result 事件数据"""
    call_id: str
    name: str
    result: str
    success: bool = True


class ErrorEventData(BaseModel):
    """error 事件数据"""
    error: str
    code: Optional[str] = None


class DoneEventData(BaseModel):
    """done 事件数据"""
    status: Literal["complete", "cancelled"]


# ... 其他现有定义保持不变
```

---

## 5. 测试要点

### 5.1 单元测试

```python
# tests/test_streaming_collector.py

def test_streaming_collector_basic():
    collector = StreamingCollector()

    # 添加工具调用
    call_id = collector.add_tool_call("search", {"query": "test"})
    assert call_id.startswith("call_")

    # 添加工具结果
    collector.add_tool_result("search", "results", call_id)

    # 添加文本
    collector.add_text("Hello ")
    collector.add_text("World")

    # 验证
    assert collector.get_full_text() == "Hello World"
    assert collector.has_content()

    # 验证 parts 数据
    parts = collector.to_parts_data()
    assert len(parts) == 3  # tool_call, tool_result, text

    assert parts[0]["type"] == "tool_call"
    assert parts[1]["type"] == "tool_result"
    assert parts[2]["type"] == "text"
    assert parts[2]["content"] == "Hello World"


def test_streaming_collector_with_error():
    collector = StreamingCollector()

    collector.add_text("Partial response")
    collector.add_error("Connection timeout", code="TIMEOUT")

    parts = collector.to_parts_data()
    assert len(parts) == 2

    error_part = parts[1]
    assert error_part["type"] == "error"
    assert "Connection timeout" in error_part["content"]
```

### 5.2 集成测试

```python
# tests/test_agent_chat.py

async def test_chat_stream_with_tool_call(client, test_session, test_agent):
    """测试包含工具调用的流式对话"""
    response = client.post(
        f"/api/v1/sessions/{test_session.id}/chat",
        json={"message": "What's the weather?", "stream": True},
    )

    events = []
    for line in response.iter_lines():
        if line.startswith(b"data:"):
            events.append(json.loads(line[5:]))

    # 验证事件类型
    event_types = [e.get("event") for e in events]
    assert "tool_call" in event_types or "message" in event_types
    assert "done" in event_types

    # 验证消息入库
    messages = db.query(Message).filter(
        Message.topic_id == test_topic.id,
        Message.role == "assistant"
    ).all()

    assert len(messages) == 1
    ai_message = messages[0]

    # 验证 Parts
    parts = db.query(MessagePart).filter(
        MessagePart.message_id == ai_message.id
    ).order_by(MessagePart.created_at).all()

    # 至少有文本 part
    text_parts = [p for p in parts if p.type == "text"]
    assert len(text_parts) >= 1
```
