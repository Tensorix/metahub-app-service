# app/service/context_retrieval.py

from typing import Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from loguru import logger

from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.topic import Topic
from app.config import config


class ContextRetrievalService:
    """父子上下文检索服务"""

    def get_context(
        self,
        db: Session,
        message_id: UUID,
        topic_id: Optional[UUID],
        session_id: UUID,
        message_created_at: datetime,
        context_window: Optional[int] = None,
    ) -> dict:
        """
        获取命中消息的上下文。

        Args:
            db: 数据库会话
            message_id: 命中的消息ID
            topic_id: 消息所属 topic ID（可能为空）
            session_id: 消息所属 session ID
            message_created_at: 命中消息的创建时间
            context_window: 上下文窗口大小（覆盖配置默认值）

        Returns:
            {
                "type": "topic" | "window",
                "topic_id": UUID | None,
                "topic_name": str | None,
                "hit_message_id": UUID,
                "messages": [MessageResponse, ...],
                "total_count": int,
                "window_before": int,  # 仅 window 模式
                "window_after": int,   # 仅 window 模式
            }
        """
        if topic_id:
            return self._get_topic_context(db, message_id, topic_id)
        else:
            window = context_window or config.SEARCH_CONTEXT_WINDOW_SIZE
            return self._get_window_context(
                db, message_id, session_id, message_created_at, window
            )

    def _get_topic_context(
        self,
        db: Session,
        hit_message_id: UUID,
        topic_id: UUID,
    ) -> dict:
        """
        Topic 模式：返回整个 topic 下的所有消息。

        消息按 created_at 升序排列，保持对话顺序。
        """
        # 获取 topic 信息
        topic = db.query(Topic).filter(
            Topic.id == topic_id,
            Topic.is_deleted == False,
        ).first()

        topic_name = topic.name if topic else None

        # 获取 topic 下所有未删除消息
        messages = (
            db.query(Message)
            .filter(
                Message.topic_id == topic_id,
                Message.is_deleted == False,
            )
            .order_by(Message.created_at.asc())
            .all()
        )

        return {
            "type": "topic",
            "topic_id": topic_id,
            "topic_name": topic_name,
            "hit_message_id": hit_message_id,
            "messages": messages,
            "total_count": len(messages),
            "window_before": 0,
            "window_after": 0,
        }

    def _get_window_context(
        self,
        db: Session,
        hit_message_id: UUID,
        session_id: UUID,
        message_created_at: datetime,
        window_size: int,
    ) -> dict:
        """
        Window 模式：返回命中消息前后 N 条消息。

        策略：
        1. 找到命中消息在 session 中的时间位置
        2. 向前取 N 条（created_at < hit.created_at）
        3. 向后取 N 条（created_at > hit.created_at）
        4. 合并并按时间排序

        注意：这里使用 created_at 而非 offset-based 分页，
        因为消息可能被删除，基于时间的定位更稳定。
        """
        # 向前取 N 条
        before_messages = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.created_at < message_created_at,
                Message.is_deleted == False,
            )
            .order_by(Message.created_at.desc())
            .limit(window_size)
            .all()
        )
        before_messages.reverse()  # 恢复正序

        # 命中消息本身
        hit_message = db.query(Message).filter(
            Message.id == hit_message_id,
            Message.is_deleted == False,
        ).first()

        # 向后取 N 条
        after_messages = (
            db.query(Message)
            .filter(
                Message.session_id == session_id,
                Message.created_at > message_created_at,
                Message.is_deleted == False,
            )
            .order_by(Message.created_at.asc())
            .limit(window_size)
            .all()
        )

        # 合并
        all_messages = before_messages.copy()
        if hit_message:
            all_messages.append(hit_message)
        all_messages.extend(after_messages)

        return {
            "type": "window",
            "topic_id": None,
            "topic_name": None,
            "hit_message_id": hit_message_id,
            "messages": all_messages,
            "total_count": len(all_messages),
            "window_before": len(before_messages),
            "window_after": len(after_messages),
        }

    def get_contexts_batch(
        self,
        db: Session,
        search_results: list[dict],
        context_window: Optional[int] = None,
    ) -> list[dict]:
        """
        批量获取搜索结果的上下文。

        对搜索结果进行分组优化：
        - 同一 topic 的多个命中只查一次 topic 消息
        - 同一 session 的 window 查询合并

        Args:
            db: 数据库会话
            search_results: SearchService 返回的搜索结果
            context_window: 上下文窗口大小

        Returns:
            每个搜索结果附带上下文的列表
        """
        window = context_window or config.SEARCH_CONTEXT_WINDOW_SIZE

        # 按 topic 分组缓存
        topic_cache: dict[UUID, dict] = {}

        results_with_context = []

        for result in search_results:
            topic_id = result.get("topic_id")

            if topic_id:
                # Topic 模式：使用缓存
                if topic_id not in topic_cache:
                    context = self._get_topic_context(
                        db, result["message_id"], topic_id
                    )
                    topic_cache[topic_id] = context
                else:
                    # 复用缓存的 topic 消息，仅更换 hit_message_id
                    cached = topic_cache[topic_id]
                    context = {
                        **cached,
                        "hit_message_id": result["message_id"],
                    }
            else:
                # Window 模式
                context = self._get_window_context(
                    db,
                    result["message_id"],
                    result["session_id"],
                    result["message_created_at"],
                    window,
                )

            results_with_context.append({
                "search_result": result,
                "context": context,
            })

        return results_with_context
