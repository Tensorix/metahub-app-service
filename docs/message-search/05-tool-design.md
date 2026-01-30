# Step 5: Agent 内置工具设计

## 1. 概述

搜索系统以 Agent built-in tool 的形式集成，通过 `@ToolRegistry.register()` 注册，
遵循现有工具模式（如 `calculator`, `datetime_tool`, `search`）。

**核心挑战**：现有 built-in tools 是无状态的纯函数（无 DB 访问、无用户上下文）。
搜索工具需要 DB session 和 user_id 来执行查询，需要设计上下文注入机制。

## 2. 上下文注入方案：ContextVar

使用 Python 标准库 `contextvars.ContextVar` 在 Agent 执行前设置运行时上下文，
工具函数在执行时读取。这是 Python 异步编程中的标准做法，无侵入性。

```python
# app/agent/tools/context.py

from contextvars import ContextVar
from typing import Optional
from uuid import UUID

# Agent 运行时上下文
agent_user_id: ContextVar[Optional[UUID]] = ContextVar(
    "agent_user_id", default=None
)
```

### 在 DeepAgentService 中设置上下文

```python
# app/agent/deep_agent_service.py 修改

from app.agent.tools.context import agent_user_id

class DeepAgentService:

    async def chat(self, message, thread_id, user_id=None, session_id=None):
        # 设置工具运行时上下文
        token = agent_user_id.set(user_id)
        try:
            agent = self._get_agent()
            # ... 正常执行 ...
        finally:
            agent_user_id.reset(token)

    async def chat_stream(self, message, thread_id, user_id=None, session_id=None):
        token = agent_user_id.set(user_id)
        try:
            agent = self._get_agent()
            # ... 正常执行 ...
        finally:
            agent_user_id.reset(token)
```

### 在工具中读取上下文

```python
# 工具内部
from app.agent.tools.context import agent_user_id
from app.db.session import SessionLocal

def _get_user_id() -> UUID:
    uid = agent_user_id.get()
    if uid is None:
        raise RuntimeError("No user context available")
    return uid

def _get_db():
    """创建独立的 DB session 供工具使用。"""
    return SessionLocal()
```

## 3. 工具定义

### Tool 1: `search_messages` — 消息搜索

```python
# app/agent/tools/builtin/message_search.py

"""
Message Search Tool - Search PM and group messages with hybrid retrieval.
"""

from typing import Optional
from app.agent.tools.registry import ToolRegistry
from app.agent.tools.context import agent_user_id
from app.db.session import SessionLocal


@ToolRegistry.register(
    name="search_messages",
    description=(
        "Search through the user's PM and group chat messages. "
        "Supports keyword fuzzy matching and semantic search. "
        "Can filter by sender name, group/chat name, time range, "
        "and message type (pm/group). "
        "Returns matched messages with surrounding context."
    ),
    category="data",
)
def search_messages(
    query: str,
    sender: str = "",
    group_name: str = "",
    session_type: str = "",
    start_date: str = "",
    end_date: str = "",
    top_k: int = 10,
    include_context: bool = True,
) -> str:
    """
    Search user's chat messages with hybrid fuzzy + semantic search.

    Args:
        query: Search keywords or natural language query.
        sender: Filter by sender name (partial match supported).
                Example: "张三" or "Zhang"
        group_name: Filter by group/chat name (partial match supported).
                    Example: "技术群" or "Tech Team"
        session_type: Filter by type: "pm" for private messages,
                      "group" for group chats, empty for both.
        start_date: Filter messages after this date (YYYY-MM-DD format).
                    Example: "2025-01-01"
        end_date: Filter messages before this date (YYYY-MM-DD format).
                  Example: "2025-01-31"
        top_k: Maximum number of results to return (default: 10).
        include_context: Whether to include surrounding messages
                         for context (default: true).

    Returns:
        Formatted search results with message content, sender,
        time, and optional context messages.
    """
    from uuid import UUID
    from datetime import datetime
    from app.service.search import SearchService
    from app.service.context_retrieval import ContextRetrievalService

    # 1. 获取用户上下文
    user_id = agent_user_id.get()
    if user_id is None:
        return "Error: No user context available. Cannot perform search."

    # 2. 解析参数
    session_types = None
    if session_type:
        if session_type in ("pm", "group"):
            session_types = [session_type]
        else:
            return f"Error: Invalid session_type '{session_type}'. Use 'pm', 'group', or leave empty for both."

    parsed_start = None
    parsed_end = None
    try:
        if start_date:
            parsed_start = datetime.strptime(start_date, "%Y-%m-%d")
        if end_date:
            parsed_end = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59
            )
    except ValueError:
        return "Error: Invalid date format. Use YYYY-MM-DD."

    # 3. 执行搜索
    db = SessionLocal()
    try:
        search_service = SearchService()
        results = search_service.search_messages(
            db=db,
            user_id=user_id,
            query=query,
            mode="hybrid",
            session_types=session_types,
            top_k=top_k,
            sender_filter=sender or None,
            session_name_filter=group_name or None,
            start_date=parsed_start,
            end_date=parsed_end,
        )

        if not results:
            return f"No messages found matching query: '{query}'"

        # 4. 获取上下文
        if include_context:
            context_service = ContextRetrievalService()
            results_with_context = context_service.get_contexts_batch(
                db=db,
                search_results=results,
            )
            return _format_results_with_context(results_with_context)
        else:
            return _format_results(results)

    except Exception as e:
        return f"Error searching messages: {str(e)}"
    finally:
        db.close()


@ToolRegistry.register(
    name="get_message_context",
    description=(
        "Get the surrounding context of a specific message. "
        "If the message belongs to a topic, returns all topic messages. "
        "Otherwise returns nearby messages in the same conversation."
    ),
    category="data",
)
def get_message_context(message_id: str) -> str:
    """
    Get surrounding context for a specific message.

    Args:
        message_id: The UUID of the message to get context for.

    Returns:
        Context messages surrounding the specified message.
    """
    from uuid import UUID
    from app.service.context_retrieval import ContextRetrievalService
    from app.db.model.message_search_index import MessageSearchIndex

    user_id = agent_user_id.get()
    if user_id is None:
        return "Error: No user context available."

    try:
        msg_uuid = UUID(message_id)
    except ValueError:
        return f"Error: Invalid message ID format: {message_id}"

    db = SessionLocal()
    try:
        index = db.query(MessageSearchIndex).filter(
            MessageSearchIndex.message_id == msg_uuid,
            MessageSearchIndex.user_id == user_id,
        ).first()

        if not index:
            return f"Message not found: {message_id}"

        context_service = ContextRetrievalService()
        context = context_service.get_context(
            db=db,
            message_id=msg_uuid,
            topic_id=index.topic_id,
            session_id=index.session_id,
            message_created_at=index.message_created_at,
        )

        return _format_context(context)

    except Exception as e:
        return f"Error getting message context: {str(e)}"
    finally:
        db.close()


# ============ 格式化函数 ============

def _format_results(results: list[dict]) -> str:
    """将搜索结果格式化为 LLM 可读文本。"""
    lines = [f"Found {len(results)} message(s):\n"]

    for i, r in enumerate(results, 1):
        created = r["message_created_at"]
        time_str = created.strftime("%Y-%m-%d %H:%M") if created else "unknown"
        sender = r.get("sender_name") or "unknown"
        session_type = r.get("session_type", "")
        session_name = r.get("session_name") or ""

        header = f"[{session_type}]"
        if session_name:
            header += f" {session_name}"

        lines.append(
            f"--- Result {i} (score: {r['score']:.2f}) ---\n"
            f"  {header} | {sender} | {time_str}\n"
            f"  ID: {r['message_id']}\n"
            f"  Content: {r['content_text'][:300]}\n"
        )

    return "\n".join(lines)


def _format_results_with_context(results_with_context: list[dict]) -> str:
    """将搜索结果 + 上下文格式化为 LLM 可读文本。"""
    lines = [f"Found {len(results_with_context)} message(s):\n"]

    for i, item in enumerate(results_with_context, 1):
        r = item["search_result"]
        ctx = item["context"]

        created = r["message_created_at"]
        time_str = created.strftime("%Y-%m-%d %H:%M") if created else "unknown"
        sender = r.get("sender_name") or "unknown"
        session_name = r.get("session_name") or ""
        session_type = r.get("session_type", "")

        header = f"[{session_type}]"
        if session_name:
            header += f" {session_name}"

        lines.append(
            f"=== Result {i} (score: {r['score']:.2f}) ===\n"
            f"  {header} | Hit: {sender} | {time_str}\n"
        )

        # 上下文类型
        if ctx["type"] == "topic":
            topic_name = ctx.get("topic_name") or "unnamed topic"
            lines.append(f"  Context: Topic \"{topic_name}\" ({ctx['total_count']} messages)\n")
        else:
            lines.append(
                f"  Context: Window ({ctx['window_before']} before, "
                f"{ctx['window_after']} after)\n"
            )

        # 上下文消息
        lines.append("  Messages:")
        for msg in ctx["messages"]:
            msg_time = msg.created_at.strftime("%H:%M") if msg.created_at else ""
            msg_sender = msg.sender.name if msg.sender else "unknown"
            is_hit = " <<<HIT>>>" if msg.id == r["message_id"] else ""

            # 提取文本内容
            text_parts = []
            for part in msg.parts:
                if part.type == "text":
                    text_parts.append(part.content)
                elif part.type == "at":
                    text_parts.append(f"@{part.content}")

            content = " ".join(text_parts)[:200]
            lines.append(f"    [{msg_time}] {msg_sender}: {content}{is_hit}")

        lines.append("")  # 空行分隔

    return "\n".join(lines)


def _format_context(context: dict) -> str:
    """格式化单条消息的上下文。"""
    lines = []

    if context["type"] == "topic":
        topic_name = context.get("topic_name") or "unnamed topic"
        lines.append(f"Topic: \"{topic_name}\" ({context['total_count']} messages)\n")
    else:
        lines.append(
            f"Context window: {context['window_before']} before, "
            f"{context['window_after']} after "
            f"({context['total_count']} messages total)\n"
        )

    for msg in context["messages"]:
        msg_time = msg.created_at.strftime("%Y-%m-%d %H:%M") if msg.created_at else ""
        msg_sender = msg.sender.name if msg.sender else "unknown"
        is_hit = " <<<HIT>>>" if msg.id == context["hit_message_id"] else ""

        text_parts = []
        for part in msg.parts:
            if part.type == "text":
                text_parts.append(part.content)
            elif part.type == "at":
                text_parts.append(f"@{part.content}")

        content = " ".join(text_parts)[:300]
        lines.append(f"[{msg_time}] {msg_sender}: {content}{is_hit}")

    return "\n".join(lines)
```

## 4. 工具注册

```python
# app/agent/tools/builtin/__init__.py (更新)

"""
Builtin tools for agents.

Available tools:
- search: Web search
- calculator: Mathematical calculations
- datetime: Date and time operations
- search_messages: Chat message search with hybrid retrieval
- get_message_context: Get surrounding context of a message
"""

from . import search
from . import calculator
from . import datetime_tool
from . import message_search   # 新增

__all__ = ["search", "calculator", "datetime_tool", "message_search"]
```

## 5. 在 DeepAgentService 中注入上下文

```python
# app/agent/deep_agent_service.py 修改关键部分

from app.agent.tools.context import agent_user_id

class DeepAgentService:

    async def chat(self, message, thread_id, user_id=None, session_id=None):
        # 注入用户上下文供工具使用
        token = agent_user_id.set(user_id)
        try:
            agent = self._get_agent()
            cfg = {"configurable": {"thread_id": thread_id}}
            if user_id:
                cfg["configurable"]["user_id"] = str(user_id)
            if session_id:
                if "metadata" not in cfg:
                    cfg["metadata"] = {}
                cfg["metadata"]["assistant_id"] = str(session_id)

            response = await agent.ainvoke(
                {"messages": [{"role": "user", "content": message}]},
                config=cfg,
            )
            messages = response.get("messages", [])
            for msg in reversed(messages):
                if isinstance(msg, AIMessage) or getattr(msg, "type", None) == "ai":
                    return msg.content
            return ""
        finally:
            agent_user_id.reset(token)

    async def chat_stream(self, message, thread_id, user_id=None, session_id=None):
        token = agent_user_id.set(user_id)
        try:
            agent = self._get_agent()
            # ... 与现有逻辑相同，在 finally 中 reset token ...
            cfg = {"configurable": {"thread_id": thread_id}}
            if user_id:
                cfg["configurable"]["user_id"] = str(user_id)
            if session_id:
                if "metadata" not in cfg:
                    cfg["metadata"] = {}
                cfg["metadata"]["assistant_id"] = str(session_id)

            async for event in agent.astream_events(
                {"messages": [{"role": "user", "content": message}]},
                config=cfg,
                version="v2",
            ):
                # ... 现有 event 处理逻辑不变 ...
                yield event_dict
        finally:
            agent_user_id.reset(token)
```

## 6. Agent 配置示例

在创建 Agent 时将搜索工具加入 tools 列表：

```json
{
    "name": "Chat Assistant",
    "system_prompt": "You are a helpful assistant. When users ask about past conversations or messages, use the search_messages tool to find relevant information. Always include context from the surrounding messages to provide complete answers.",
    "model": "gpt-4o-mini",
    "tools": ["search_messages", "get_message_context", "current_time", "calculator"],
    "temperature": 0.7
}
```

## 7. 工具交互流程示例

### 场景 1：按人搜索
```
用户: "张三上周说了什么关于代码审查的内容？"

Agent 思考: 需要搜索张三的消息，关键词是代码审查，时间是上周
Agent 调用: search_messages(
    query="代码审查",
    sender="张三",
    start_date="2025-01-20",
    end_date="2025-01-26"
)
工具返回:
    === Result 1 (score: 0.89) ===
      [group] 技术讨论群 | Hit: 张三 | 2025-01-22 14:30
      Context: Topic "代码审查流程" (5 messages)
      Messages:
        [14:28] 李四: 我们需要规范一下代码审查流程
        [14:30] 张三: 建议每个PR至少要两个人review <<<HIT>>>
        [14:31] 张三: 而且要有checklist，包括安全、性能和代码风格
        [14:33] 王五: 同意，我来整理一个checklist模板
        [14:35] 李四: 好的，下周开始执行

Agent 回答: 上周三（1月22日）在技术讨论群里...
```

### 场景 2：按群名搜索
```
用户: "产品群里最近有提到新功能的讨论吗？"

Agent 调用: search_messages(
    query="新功能",
    group_name="产品",
    session_type="group",
    top_k=5
)
```

### 场景 3：语义搜索
```
用户: "有没有人讨论过怎么优化系统性能？"

Agent 调用: search_messages(
    query="系统性能优化方案",
    top_k=5
)
// 向量搜索会匹配到语义相关的内容，
// 即使原文用的是 "提升响应速度" 或 "减少延迟" 等不同表述
```

## 8. 设计决策

### 为什么用 ContextVar 而不是其他方案？

| 方案 | 优势 | 劣势 |
|------|------|------|
| **ContextVar（选定）** | Python 标准库，线程/协程安全，无侵入 | 需要在 caller 中 set/reset |
| 闭包/工厂 | 简单直观 | 每次创建 agent 都要重新注册工具 |
| 全局变量 | 最简单 | 不支持并发，不安全 |
| 工具参数传 user_id | 无需额外机制 | Agent LLM 不知道 user_id 值 |

### 为什么工具自己创建 DB session？

- 工具是同步函数，在独立的调用栈中执行
- 使用独立的 `SessionLocal()` 避免与 FastAPI 请求级 session 冲突
- 每次工具调用创建、使用、关闭，确保连接不泄漏

### 返回格式为什么是纯文本？

- LangChain tool 约束：返回值必须是 `str`
- LLM 需要人类可读的文本来理解和组织回答
- 格式化文本使用标记（如 `<<<HIT>>>`）帮助 LLM 识别命中位置

## 9. 新增文件清单

```
app/agent/tools/
├── context.py                  # [新增] ContextVar 定义
└── builtin/
    ├── __init__.py             # [修改] 导入 message_search
    └── message_search.py       # [新增] 搜索工具实现
```
