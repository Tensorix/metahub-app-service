# app/service/search/search_service.py

from typing import Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.orm import Session

from app.service.search.engine import HybridSearchEngine
from app.service.search.message_provider import MessageSearchProvider


class SearchService:
    """
    搜索服务入口。

    封装 Provider + Engine 的组合调用，提供简洁的 API。
    未来添加新类别时在此注册新方法即可。
    """

    def __init__(self):
        self._engine = HybridSearchEngine()
        self._message_provider = MessageSearchProvider()

    def search_messages(
        self,
        db: Session,
        user_id: UUID,
        query: str,
        mode: str = "hybrid",
        session_id: Optional[UUID] = None,
        session_types: Optional[list[str]] = None,
        top_k: int = 20,
        sender_filter: Optional[str] = None,
        session_name_filter: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[dict]:
        """搜索消息。"""
        filters = self._message_provider.build_base_filters(
            user_id=user_id,
            session_id=session_id,
            session_types=session_types,
            sender_filter=sender_filter,
            session_name_filter=session_name_filter,
            start_date=start_date,
            end_date=end_date,
        )
        return self._engine.search(
            db=db,
            provider=self._message_provider,
            query=query,
            mode=mode,
            top_k=top_k,
            extra_filters=filters,
        )
