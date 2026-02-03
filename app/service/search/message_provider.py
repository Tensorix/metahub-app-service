# app/service/search/message_provider.py

from typing import Optional, Any
from uuid import UUID
from datetime import datetime

from app.service.search.provider import SearchProvider


class MessageSearchProvider(SearchProvider):
    """消息搜索 Provider。"""

    def get_table_name(self) -> str:
        return "message_search_index"

    def get_content_column(self) -> str:
        return "content_text"

    def get_embedding_table(self) -> str:
        return "message_embedding"

    def get_category(self) -> str:
        return "message"

    def get_select_columns(self) -> list[str]:
        return [
            "message_id",
            "session_id",
            "session_type",
            "session_name",
            "topic_id",
            "content_text",
            "sender_name",
            "role",
            "message_created_at",
        ]

    def get_id_column(self) -> str:
        return "message_id"

    def build_base_filters(
        self,
        user_id: UUID,
        session_id: Optional[UUID] = None,
        session_types: Optional[list[str]] = None,
        sender_filter: Optional[str] = None,
        session_name_filter: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        **kwargs,
    ) -> tuple[list[str], dict]:
        """构建消息搜索的过滤条件。"""
        where = ["t.user_id = :user_id"]
        params: dict[str, Any] = {"user_id": str(user_id)}

        types = session_types or ["pm", "group"]
        where.append("t.session_type = ANY(:session_types)")
        params["session_types"] = types

        if session_id:
            where.append("t.session_id = :session_id")
            params["session_id"] = str(session_id)

        if sender_filter:
            where.append(
                "t.sender_name IS NOT NULL AND "
                "t.sender_name ILIKE :sender_filter"
            )
            params["sender_filter"] = f"%{sender_filter}%"

        if session_name_filter:
            where.append(
                "t.session_name IS NOT NULL AND "
                "t.session_name ILIKE :session_name_filter"
            )
            params["session_name_filter"] = f"%{session_name_filter}%"

        if start_date:
            where.append("t.message_created_at >= :start_date")
            params["start_date"] = start_date.isoformat()

        if end_date:
            where.append("t.message_created_at <= :end_date")
            params["end_date"] = end_date.isoformat()

        return where, params

    def format_result(self, row: Any) -> dict:
        return {
            "message_id": row.message_id,
            "session_id": row.session_id,
            "session_type": row.session_type,
            "session_name": row.session_name,
            "topic_id": row.topic_id,
            "content_text": row.content_text,
            "sender_name": row.sender_name,
            "role": row.role,
            "message_created_at": row.message_created_at,
        }
