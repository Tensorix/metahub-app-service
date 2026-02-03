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
        
        # 如果没有 query，使用 filter-only 模式直接返回匹配的消息
        # 而不是走 hybrid 搜索（hybrid 模式需要有效的 query）
        if not query.strip():
            results = search_service.search_messages(
                db=db,
                user_id=user_id,
                query="",
                mode="filter_only",  # 仅使用过滤条件，不进行相似度搜索
                session_types=session_types,
                top_k=top_k,
                sender_filter=sender or None,
                session_name_filter=group_name or None,
                start_date=parsed_start,
                end_date=parsed_end,
            )
        else:
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
