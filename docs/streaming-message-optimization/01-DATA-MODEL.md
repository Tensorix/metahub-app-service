# 数据模型设计

## 1. Message 表扩展

### 1.1 新增 `message_str` 字段

**目的**：
- 存储纯文本内容，便于全文检索
- 统一处理（摘要、导出、展示等）
- 避免每次查询都需要遍历和解析 Parts

**字段定义**：

```python
# app/db/model/message.py

class Message(Base):
    # ... 现有字段 ...

    message_str: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="消息纯文本内容，由 parts 合成，用于检索和统一处理"
    )
```

**数据库迁移**：

```python
# alembic/versions/xxx_add_message_str.py

def upgrade():
    op.add_column(
        'message',
        sa.Column('message_str', sa.Text(), nullable=True, comment='消息纯文本内容')
    )
    # 可选：为现有数据生成 message_str
    # 见下方数据迁移脚本


def downgrade():
    op.drop_column('message', 'message_str')
```

### 1.2 纯文本生成规则

将多个 Parts 转换为单一纯文本字符串，规则如下：

| Part Type | 转换规则 | 示例输出 |
|-----------|---------|---------|
| `text` | 直接使用内容 | `"这是文本内容"` |
| `thinking` | `[思考: {content前50字}...]` | `"[思考: 我需要先分析...]"` |
| `tool_call` | `[调用工具: {name}]` | `"[调用工具: search]"` |
| `tool_result` | `[工具结果: {name}]` 或忽略 | `"[工具结果: search]"` |
| `error` | `[错误: {error}]` | `"[错误: 连接超时]"` |
| `image` | `[图片]` | `"[图片]"` |
| `at` | `@{name}` | `"@张三"` |
| `url` | 直接使用 URL | `"https://example.com"` |
| `json` | `[JSON数据]` 或忽略 | `"[JSON数据]"` |

**Python 实现**：

```python
# app/utils/message_utils.py

import json
from typing import List, Optional
from app.constants.message import MessagePartType


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

        if part_type == MessagePartType.TEXT:
            if content.strip():
                segments.append(content)

        elif part_type == MessagePartType.THINKING and include_tool_info:
            # 思考内容截取前50字符
            preview = content[:50] + "..." if len(content) > 50 else content
            segments.append(f"[思考: {preview}]")

        elif part_type == MessagePartType.TOOL_CALL and include_tool_info:
            try:
                data = json.loads(content)
                name = data.get("name", "unknown")
                segments.append(f"[调用工具: {name}]")
            except json.JSONDecodeError:
                segments.append("[调用工具]")

        elif part_type == MessagePartType.TOOL_RESULT and include_tool_info:
            try:
                data = json.loads(content)
                name = data.get("name", "unknown")
                # 可选：包含简短结果
                # result = data.get("result", "")[:50]
                segments.append(f"[工具结果: {name}]")
            except json.JSONDecodeError:
                segments.append("[工具结果]")

        elif part_type == MessagePartType.ERROR:
            try:
                data = json.loads(content)
                error = data.get("error", "未知错误")
                segments.append(f"[错误: {error}]")
            except json.JSONDecodeError:
                segments.append(f"[错误: {content}]")

        elif part_type == MessagePartType.IMAGE:
            segments.append("[图片]")

        elif part_type == MessagePartType.AT:
            # AT 内容通常是被 @ 的用户名或 ID
            segments.append(f"@{content}")

        elif part_type == MessagePartType.URL:
            segments.append(content)

        elif part_type == MessagePartType.JSON:
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

### 1.3 message_str 生成时机

**方案：保存消息时同步生成**

```python
# app/router/v1/agent_chat.py

async def _save_message_with_parts(
    db: Session,
    user_id: UUID,
    topic_id: UUID,
    role: str,
    parts_data: List[dict],
    message_metadata: Optional[dict] = None,
) -> Message:
    """保存消息及其多个 Parts"""
    from app.utils.message_utils import parts_to_message_str

    # ... 获取 session_id ...

    # 生成 message_str
    message_str = parts_to_message_str(parts_data)

    # 创建 message
    message = Message(
        user_id=user_id,
        session_id=topic.session_id,
        topic_id=topic_id,
        role=role,
        message_str=message_str,  # 新增
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    # 创建 parts...
```

### 1.4 现有数据迁移脚本

```python
# scripts/migrate_message_str.py

"""
为现有消息生成 message_str

用法: python -m scripts.migrate_message_str
"""

import json
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.utils.message_utils import parts_to_message_str


def migrate():
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # 查询所有没有 message_str 的消息
        query = text("""
            SELECT m.id, array_agg(
                json_build_object(
                    'type', mp.type,
                    'content', mp.content,
                    'metadata_', mp.metadata_
                ) ORDER BY mp.created_at
            ) as parts
            FROM message m
            LEFT JOIN message_part mp ON mp.message_id = m.id
            WHERE m.message_str IS NULL
            GROUP BY m.id
        """)

        results = db.execute(query).fetchall()
        print(f"Found {len(results)} messages to migrate")

        batch_size = 100
        for i, (msg_id, parts) in enumerate(results):
            if parts and parts[0] is not None:
                # parts 是 JSON 数组
                parts_list = parts if isinstance(parts, list) else json.loads(parts)
                message_str = parts_to_message_str(parts_list)

                db.execute(
                    text("UPDATE message SET message_str = :msg_str WHERE id = :id"),
                    {"msg_str": message_str, "id": msg_id}
                )

            if (i + 1) % batch_size == 0:
                db.commit()
                print(f"Migrated {i + 1}/{len(results)} messages")

        db.commit()
        print(f"Migration complete: {len(results)} messages updated")

    finally:
        db.close()


if __name__ == "__main__":
    migrate()
```

### 1.5 检索集成

`message_str` 可直接用于现有的消息检索功能：

```python
# 全文检索示例
messages = db.query(Message).filter(
    Message.message_str.ilike(f"%{keyword}%")
).all()

# 向量检索时，使用 message_str 生成 embedding
embedding = embedding_model.encode(message.message_str)
```

---

## 2. MessagePartType 常量扩展

### 1.1 当前定义

**文件**: `app/constants/message.py`

```python
class MessagePartType:
    TEXT = "text"
    IMAGE = "image"
    AT = "at"
    URL = "url"
    JSON = "json"

    KNOWN_TYPES = frozenset({TEXT, IMAGE, AT, URL, JSON})
```

### 1.2 扩展定义

```python
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
    THINKING: AI 思考过程（可选，未来扩展）
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

    # AI 相关类型集合（便于筛选）
    AI_TYPES = frozenset({TOOL_CALL, TOOL_RESULT, ERROR, THINKING})
```

---

## 2. MessagePart 内容结构

### 2.1 type=tool_call

存储 AI 发起的工具调用请求。

```python
# content 字段存储 JSON 字符串
{
    "call_id": "call_abc123",     # 调用唯一标识，用于关联 result
    "name": "search",             # 工具名称
    "args": {                     # 工具参数
        "query": "天气预报",
        "limit": 10
    }
}

# metadata_ 字段
{
    "timestamp": "2024-01-01T10:00:00.123Z",  # 调用时间
    "tool_id": "tool_xyz"                     # 可选：工具 ID
}
```

**示例 MessagePart**:

```python
MessagePart(
    message_id=message.id,
    type=MessagePartType.TOOL_CALL,
    content=json.dumps({
        "call_id": "call_abc123",
        "name": "search",
        "args": {"query": "天气预报"}
    }),
    metadata_={
        "timestamp": "2024-01-01T10:00:00.123Z"
    }
)
```

### 2.2 type=tool_result

存储工具执行结果。

```python
# content 字段存储 JSON 字符串
{
    "call_id": "call_abc123",     # 关联的调用 ID
    "name": "search",             # 工具名称（冗余，便于展示）
    "result": "搜索结果内容...",   # 执行结果（字符串）
    "success": true               # 是否成功
}

# metadata_ 字段
{
    "timestamp": "2024-01-01T10:00:01.456Z",  # 完成时间
    "duration_ms": 1200                       # 可选：执行耗时
}
```

**示例 MessagePart**:

```python
MessagePart(
    message_id=message.id,
    type=MessagePartType.TOOL_RESULT,
    content=json.dumps({
        "call_id": "call_abc123",
        "name": "search",
        "result": "找到 5 条相关结果...",
        "success": True
    }),
    metadata_={
        "timestamp": "2024-01-01T10:00:01.456Z",
        "duration_ms": 1200
    }
)
```

### 2.3 type=error

存储流式过程中的错误信息。

```python
# content 字段存储 JSON 字符串
{
    "error": "Rate limit exceeded",  # 错误消息
    "code": "RATE_LIMIT",            # 可选：错误码
    "recoverable": false             # 可选：是否可恢复
}

# metadata_ 字段
{
    "timestamp": "2024-01-01T10:00:02.789Z",
    "context": "tool_execution"      # 可选：错误发生上下文
}
```

**示例 MessagePart**:

```python
MessagePart(
    message_id=message.id,
    type=MessagePartType.ERROR,
    content=json.dumps({
        "error": "Tool execution timeout",
        "code": "TIMEOUT"
    }),
    metadata_={
        "timestamp": "2024-01-01T10:00:02.789Z",
        "context": "tool_execution"
    }
)
```

### 2.4 type=thinking

存储 AI 的思考过程（Chain of Thought）。

```python
# content 字段存储思考内容（纯文本）
"我需要先分析用户的问题，然后搜索相关信息..."

# metadata_ 字段
{
    "timestamp": "2024-01-01T10:00:00.123Z",
    "duration_ms": 500,           # 可选：思考耗时
    "model": "claude-3-opus"      # 可选：模型信息
}
```

**示例 MessagePart**:

```python
MessagePart(
    message_id=message.id,
    type=MessagePartType.THINKING,
    content="用户询问天气信息，我需要调用天气查询工具来获取实时数据...",
    metadata_={
        "timestamp": "2024-01-01T10:00:00.123Z"
    }
)
```

### 2.5 type=text（现有，无变化）

```python
MessagePart(
    message_id=message.id,
    type=MessagePartType.TEXT,
    content="这是 AI 的文本回复内容。",
    metadata_={}
)
```

---

## 3. Part 顺序与时序

### 3.1 顺序规则

MessagePart 的创建顺序反映事件发生的时序：

```
1. thinking (思考过程)
2. tool_call (调用工具 A)
3. tool_result (工具 A 结果)
4. tool_call (调用工具 B)
5. tool_result (工具 B 结果)
6. text (最终文本回复)
7. error (如有错误)
```

### 3.2 时序保证

- 使用 `created_at` 字段记录入库时间
- 使用 `metadata_.timestamp` 记录事件发生时间
- Part 顺序按事件发生顺序排列

### 3.3 查询排序

```python
# 按创建时间排序获取 Parts
parts = db.query(MessagePart).filter(
    MessagePart.message_id == message_id
).order_by(MessagePart.created_at.asc()).all()
```

---

## 4. call_id 关联机制

### 4.1 生成规则

```python
import uuid

def generate_call_id() -> str:
    """生成工具调用唯一标识"""
    return f"call_{uuid.uuid4().hex[:12]}"
```

### 4.2 关联关系

```
tool_call (call_id="call_abc123")
    ↓
tool_result (call_id="call_abc123")
```

### 4.3 前端关联查询

```typescript
// 找到 tool_call 对应的 result
const toolCalls = parts.filter(p => p.type === 'tool_call');
const toolResults = parts.filter(p => p.type === 'tool_result');

for (const call of toolCalls) {
    const callData = JSON.parse(call.content);
    const result = toolResults.find(r => {
        const resultData = JSON.parse(r.content);
        return resultData.call_id === callData.call_id;
    });
    // call 和 result 已关联
}
```

---

## 5. Schema 更新

### 5.1 MessagePartType Schema

**文件**: `app/schema/session.py`

```python
from typing import Literal

# 更新 MessagePart 的 type 字段描述
class MessagePartCreate(BaseModel):
    type: str = Field(
        ...,
        description="Part 类型: text, image, at, url, json, tool_call, tool_result, error",
        max_length=50
    )
    content: str = Field(..., description="内容（文本或 JSON 字符串）")
    metadata: Optional[dict] = Field(None, description="扩展元数据")


class MessagePartResponse(BaseModel):
    id: UUID
    message_id: UUID
    type: str
    content: str
    metadata: Optional[dict] = Field(None, alias="metadata_")
    created_at: datetime

    class Config:
        from_attributes = True
```

### 5.2 前端类型定义

**文件**: `frontend/src/lib/api.ts`

```typescript
// MessagePart type 扩展
export type MessagePartType =
  | 'text'
  | 'image'
  | 'at'
  | 'url'
  | 'json'
  | 'tool_call'
  | 'tool_result'
  | 'error';

export interface MessagePart {
  id: string;
  message_id: string;
  type: MessagePartType;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// AI 相关 Part 的解析类型
export interface ToolCallContent {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultContent {
  call_id: string;
  name: string;
  result: string;
  success: boolean;
}

export interface ErrorContent {
  error: string;
  code?: string;
  recoverable?: boolean;
}
```

---

## 6. 数据示例

### 6.1 简单文本回复

```json
{
  "id": "msg_001",
  "role": "assistant",
  "parts": [
    {
      "id": "part_001",
      "type": "text",
      "content": "你好！有什么可以帮助你的？",
      "metadata": {}
    }
  ]
}
```

### 6.2 包含工具调用的回复

```json
{
  "id": "msg_002",
  "role": "assistant",
  "parts": [
    {
      "id": "part_001",
      "type": "tool_call",
      "content": "{\"call_id\":\"call_x1\",\"name\":\"weather\",\"args\":{\"city\":\"北京\"}}",
      "metadata": {"timestamp": "2024-01-01T10:00:00Z"}
    },
    {
      "id": "part_002",
      "type": "tool_result",
      "content": "{\"call_id\":\"call_x1\",\"name\":\"weather\",\"result\":\"晴，25°C\",\"success\":true}",
      "metadata": {"timestamp": "2024-01-01T10:00:01Z", "duration_ms": 800}
    },
    {
      "id": "part_003",
      "type": "text",
      "content": "北京今天天气晴朗，气温25°C，非常适合户外活动。",
      "metadata": {}
    }
  ]
}
```

### 6.3 多次工具调用的回复

```json
{
  "id": "msg_003",
  "role": "assistant",
  "parts": [
    {
      "id": "part_001",
      "type": "tool_call",
      "content": "{\"call_id\":\"call_a\",\"name\":\"search\",\"args\":{\"query\":\"Python教程\"}}",
      "metadata": {"timestamp": "2024-01-01T10:00:00Z"}
    },
    {
      "id": "part_002",
      "type": "tool_result",
      "content": "{\"call_id\":\"call_a\",\"name\":\"search\",\"result\":\"找到10条结果\",\"success\":true}",
      "metadata": {"timestamp": "2024-01-01T10:00:02Z"}
    },
    {
      "id": "part_003",
      "type": "tool_call",
      "content": "{\"call_id\":\"call_b\",\"name\":\"read_file\",\"args\":{\"path\":\"/docs/intro.md\"}}",
      "metadata": {"timestamp": "2024-01-01T10:00:03Z"}
    },
    {
      "id": "part_004",
      "type": "tool_result",
      "content": "{\"call_id\":\"call_b\",\"name\":\"read_file\",\"result\":\"# Introduction...\",\"success\":true}",
      "metadata": {"timestamp": "2024-01-01T10:00:04Z"}
    },
    {
      "id": "part_005",
      "type": "text",
      "content": "根据搜索和文档内容，以下是 Python 入门教程的总结...",
      "metadata": {}
    }
  ]
}
```

### 6.4 包含思考过程的回复

```json
{
  "id": "msg_004",
  "role": "assistant",
  "message_str": "[思考: 用户询问天气，我需要调用天气API...]\n[调用工具: weather]\n[工具结果: weather]\n北京今天天气晴朗...",
  "parts": [
    {
      "id": "part_001",
      "type": "thinking",
      "content": "用户询问天气信息，我需要调用天气查询工具来获取北京的实时天气数据，然后用自然语言向用户描述。",
      "metadata": {"timestamp": "2024-01-01T10:00:00Z"}
    },
    {
      "id": "part_002",
      "type": "tool_call",
      "content": "{\"call_id\":\"call_w1\",\"name\":\"weather\",\"args\":{\"city\":\"北京\"}}",
      "metadata": {"timestamp": "2024-01-01T10:00:01Z"}
    },
    {
      "id": "part_003",
      "type": "tool_result",
      "content": "{\"call_id\":\"call_w1\",\"name\":\"weather\",\"result\":\"晴，25°C，湿度45%\",\"success\":true}",
      "metadata": {"timestamp": "2024-01-01T10:00:02Z", "duration_ms": 500}
    },
    {
      "id": "part_004",
      "type": "text",
      "content": "北京今天天气晴朗，气温25°C，湿度45%，非常适合户外活动。",
      "metadata": {}
    }
  ]
}
```

### 6.5 包含错误的回复

```json
{
  "id": "msg_005",
  "role": "assistant",
  "parts": [
    {
      "id": "part_001",
      "type": "tool_call",
      "content": "{\"call_id\":\"call_err\",\"name\":\"api_call\",\"args\":{\"url\":\"https://example.com\"}}",
      "metadata": {"timestamp": "2024-01-01T10:00:00Z"}
    },
    {
      "id": "part_002",
      "type": "error",
      "content": "{\"error\":\"Connection timeout\",\"code\":\"TIMEOUT\"}",
      "metadata": {"timestamp": "2024-01-01T10:00:30Z", "context": "tool_execution"}
    },
    {
      "id": "part_003",
      "type": "text",
      "content": "抱歉，调用外部 API 时发生超时错误。请稍后重试。",
      "metadata": {}
    }
  ]
}
```

---

## 7. 迁移说明

### 7.1 无需数据迁移

- 现有数据仍然有效
- 老消息只有 `type=text` 的 Part
- 新消息可能有多种 Part 类型

### 7.2 常量文件更新

只需更新 `app/constants/message.py` 添加新的 Part 类型常量。

### 7.3 前端类型更新

更新 TypeScript 类型定义以支持新的 Part 类型。
