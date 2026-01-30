# Step 6: 实时索引 + 批量回填

## 1. 概述

索引管线分为两个部分：
- **实时索引**：每条新消息创建后自动建立搜索索引
- **批量回填**：为存量消息批量构建索引和 embedding

## 2. SearchIndexerService 实现

```python
# app/service/search_indexer.py

import re
from typing import Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from loguru import logger

from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_search_index import MessageSearchIndex
from app.db.model.session import Session as SessionModel
from app.service.embedding import EmbeddingService
from app.config import config


def extract_searchable_text(message: Message) -> str:
    """
    从消息的所有 parts 中提取可搜索文本。
    """
    text_parts = []
    for part in message.parts:
        if part.type == "text":
            text_parts.append(part.content)
        elif part.type == "at":
            text_parts.append(f"@{part.content}")
        elif part.type == "url":
            text_parts.append(part.content)
    return "\n".join(text_parts).strip()


def preprocess_text(text: str) -> str:
    """对提取的文本进行预处理。"""
    if not text:
        return ""
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


class SearchIndexerService:
    """搜索索引管理服务"""

    def __init__(self):
        self._embedding_service = EmbeddingService()

    # ========== 实时索引 ==========

    def index_message(self, db: Session, message: Message) -> Optional[MessageSearchIndex]:
        """
        为单条消息创建搜索索引。
        在 MessageService.create_message() 之后调用。

        流程:
        1. 检查 session 类型是否为 pm/group（只索引这两种）
        2. 提取文本内容
        3. 创建索引记录（embedding_status = pending）
        4. 同步生成 embedding（如果配置允许）

        Args:
            db: 数据库会话
            message: 已创建的消息对象（需要已加载 parts 和 session）

        Returns:
            创建的搜索索引记录，如果不符合索引条件则返回 None
        """
        # 1. 检查 session 类型
        session = message.session
        if session.type not in ("pm", "group"):
            return None

        # 2. 提取文本
        content_text = preprocess_text(extract_searchable_text(message))
        if not content_text:
            return None

        # 3. 获取发送者名称和会话名称
        sender_name = message.sender.name if message.sender else None
        session_name = session.name  # 群名/会话名快照

        # 4. 创建索引记录
        search_index = MessageSearchIndex(
            message_id=message.id,
            user_id=message.user_id,
            session_id=message.session_id,
            session_type=session.type,
            session_name=session_name,
            topic_id=message.topic_id,
            sender_name=sender_name,
            role=message.role,
            message_created_at=message.created_at,
            content_text=content_text,
            embedding_status="pending",
        )
        db.add(search_index)

        # 5. 同步生成 embedding（可选，取决于配置）
        if config.SEARCH_SYNC_EMBEDDING:
            try:
                embedding = self._embedding_service.generate_embedding(content_text)
                if embedding:
                    search_index.embedding = embedding
                    search_index.embedding_status = "completed"
                else:
                    search_index.embedding_status = "skipped"
            except Exception as e:
                logger.error(f"Sync embedding failed for message {message.id}: {e}")
                search_index.embedding_status = "failed"

        db.commit()
        db.refresh(search_index)
        return search_index

    def update_index(self, db: Session, message: Message) -> Optional[MessageSearchIndex]:
        """
        更新已有消息的搜索索引（消息内容变更时调用）。
        """
        index = db.query(MessageSearchIndex).filter(
            MessageSearchIndex.message_id == message.id
        ).first()

        if not index:
            return self.index_message(db, message)

        content_text = preprocess_text(extract_searchable_text(message))
        if not content_text:
            db.delete(index)
            db.commit()
            return None

        index.content_text = content_text
        index.topic_id = message.topic_id
        index.sender_name = message.sender.name if message.sender else None
        index.session_name = message.session.name if message.session else None
        index.embedding_status = "pending"
        index.embedding = None  # 清空旧 embedding，等待重新生成
        index.indexed_at = func.timezone("UTC", func.now())

        if config.SEARCH_SYNC_EMBEDDING:
            try:
                embedding = self._embedding_service.generate_embedding(content_text)
                if embedding:
                    index.embedding = embedding
                    index.embedding_status = "completed"
                else:
                    index.embedding_status = "skipped"
            except Exception as e:
                logger.error(f"Update embedding failed for message {message.id}: {e}")
                index.embedding_status = "failed"

        db.commit()
        db.refresh(index)
        return index

    def delete_index(self, db: Session, message_id: UUID) -> bool:
        """删除消息的搜索索引。"""
        index = db.query(MessageSearchIndex).filter(
            MessageSearchIndex.message_id == message_id
        ).first()
        if index:
            db.delete(index)
            db.commit()
            return True
        return False

    # ========== 批量回填 ==========

    def reindex(
        self,
        db: Session,
        user_id: UUID,
        session_id: Optional[UUID] = None,
        regenerate_embeddings: bool = False,
        batch_size: int = 100,
    ) -> dict:
        """
        批量重建搜索索引。

        流程:
        1. 查询所有符合条件的消息（pm/group 类型的 session）
        2. 跳过已有索引的消息（除非 regenerate_embeddings=True）
        3. 批量创建索引记录
        4. 批量生成 embeddings

        Args:
            db: 数据库会话
            user_id: 用户ID
            session_id: 限定某个会话，为空则处理所有会话
            regenerate_embeddings: 是否重新生成所有 embeddings
            batch_size: 每批处理数量

        Returns:
            处理统计信息
        """
        stats = {
            "status": "started",
            "total_messages": 0,
            "indexed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
        }

        # 1. 构建查询
        query = (
            db.query(Message)
            .join(SessionModel, Message.session_id == SessionModel.id)
            .options(joinedload(Message.parts), joinedload(Message.sender))
            .filter(
                Message.user_id == user_id,
                Message.is_deleted == False,
                SessionModel.type.in_(["pm", "group"]),
                SessionModel.is_deleted == False,
            )
        )

        if session_id:
            query = query.filter(Message.session_id == session_id)

        if not regenerate_embeddings:
            # 只处理还没有索引的消息
            existing_ids = (
                db.query(MessageSearchIndex.message_id)
                .filter(MessageSearchIndex.user_id == user_id)
            )
            if session_id:
                existing_ids = existing_ids.filter(
                    MessageSearchIndex.session_id == session_id
                )
            existing_ids = {row[0] for row in existing_ids.all()}
        else:
            existing_ids = set()

        # 2. 分批处理
        offset = 0
        while True:
            messages = (
                query
                .order_by(Message.created_at.asc())
                .offset(offset)
                .limit(batch_size)
                .all()
            )

            if not messages:
                break

            stats["total_messages"] += len(messages)

            # 准备批量数据
            texts_to_embed = []
            indices_to_create = []

            for message in messages:
                if message.id in existing_ids and not regenerate_embeddings:
                    stats["skipped_count"] += 1
                    continue

                content_text = preprocess_text(
                    extract_searchable_text(message)
                )
                if not content_text:
                    stats["skipped_count"] += 1
                    continue

                session = message.session
                sender_name = message.sender.name if message.sender else None
                session_name = session.name

                indices_to_create.append({
                    "message": message,
                    "content_text": content_text,
                    "session_type": session.type,
                    "session_name": session_name,
                    "sender_name": sender_name,
                })
                texts_to_embed.append(content_text)

            # 3. 批量生成 embeddings
            embeddings = []
            if texts_to_embed:
                try:
                    embeddings = self._embedding_service.generate_embeddings_batch(
                        texts_to_embed
                    )
                except Exception as e:
                    logger.error(f"Batch embedding failed: {e}")
                    embeddings = [None] * len(texts_to_embed)

            # 4. 创建/更新索引记录
            for i, item in enumerate(indices_to_create):
                message = item["message"]
                embedding = embeddings[i] if i < len(embeddings) else None

                try:
                    if regenerate_embeddings:
                        # 更新已有记录
                        existing = db.query(MessageSearchIndex).filter(
                            MessageSearchIndex.message_id == message.id
                        ).first()
                        if existing:
                            existing.content_text = item["content_text"]
                            existing.embedding = embedding
                            existing.embedding_status = (
                                "completed" if embedding else "skipped"
                            )
                            existing.indexed_at = func.timezone(
                                "UTC", func.now()
                            )
                        else:
                            self._create_index_record(
                                db, message, item, embedding
                            )
                    else:
                        self._create_index_record(
                            db, message, item, embedding
                        )

                    stats["indexed_count"] += 1
                except Exception as e:
                    logger.error(
                        f"Failed to index message {message.id}: {e}"
                    )
                    stats["failed_count"] += 1

            db.commit()
            offset += batch_size

        stats["status"] = "completed"
        return stats

    def _create_index_record(
        self,
        db: Session,
        message: Message,
        item: dict,
        embedding: Optional[list[float]],
    ):
        """创建单条索引记录。"""
        search_index = MessageSearchIndex(
            message_id=message.id,
            user_id=message.user_id,
            session_id=message.session_id,
            session_type=item["session_type"],
            session_name=item["session_name"],
            topic_id=message.topic_id,
            sender_name=item["sender_name"],
            role=message.role,
            message_created_at=message.created_at,
            content_text=item["content_text"],
            embedding=embedding,
            embedding_status="completed" if embedding else "skipped",
        )
        db.add(search_index)

    # ========== Embedding 重试 ==========

    def retry_failed_embeddings(
        self, db: Session, batch_size: int = 50
    ) -> dict:
        """
        重试之前失败的 embedding 生成。

        适合作为定时任务运行。
        """
        stats = {"retried": 0, "succeeded": 0, "still_failed": 0}

        failed_indices = (
            db.query(MessageSearchIndex)
            .filter(MessageSearchIndex.embedding_status == "failed")
            .limit(batch_size)
            .all()
        )

        if not failed_indices:
            return stats

        texts = [idx.content_text for idx in failed_indices]
        stats["retried"] = len(texts)

        try:
            embeddings = self._embedding_service.generate_embeddings_batch(texts)
            for i, index in enumerate(failed_indices):
                if embeddings[i]:
                    index.embedding = embeddings[i]
                    index.embedding_status = "completed"
                    stats["succeeded"] += 1
                else:
                    index.embedding_status = "skipped"
                    stats["still_failed"] += 1
        except Exception as e:
            logger.error(f"Retry embeddings batch failed: {e}")
            stats["still_failed"] = len(failed_indices)

        db.commit()
        return stats

    # ========== 统计信息 ==========

    def get_stats(self, db: Session, user_id: UUID) -> dict:
        """获取用户的搜索索引统计信息。"""
        base_query = db.query(MessageSearchIndex).filter(
            MessageSearchIndex.user_id == user_id
        )

        total = base_query.count()
        completed = base_query.filter(
            MessageSearchIndex.embedding_status == "completed"
        ).count()
        pending = base_query.filter(
            MessageSearchIndex.embedding_status == "pending"
        ).count()
        failed = base_query.filter(
            MessageSearchIndex.embedding_status == "failed"
        ).count()
        skipped = base_query.filter(
            MessageSearchIndex.embedding_status == "skipped"
        ).count()

        sessions = (
            db.query(func.count(func.distinct(MessageSearchIndex.session_id)))
            .filter(MessageSearchIndex.user_id == user_id)
            .scalar()
        )

        last_indexed = (
            db.query(func.max(MessageSearchIndex.indexed_at))
            .filter(MessageSearchIndex.user_id == user_id)
            .scalar()
        )

        return {
            "total_indexed": total,
            "embedding_completed": completed,
            "embedding_pending": pending,
            "embedding_failed": failed,
            "embedding_skipped": skipped,
            "sessions_indexed": sessions or 0,
            "last_indexed_at": last_indexed,
        }
```

## 3. 集成到 MessageService

在 `MessageService.create_message()` 之后触发索引：

```python
# app/service/session.py 中修改 MessageService

class MessageService:

    @staticmethod
    def create_message(db: Session, data: MessageCreate, user_id: UUID) -> Message:
        message = Message(
            user_id=user_id,
            session_id=data.session_id,
            topic_id=data.topic_id,
            role=data.role,
            sender_id=data.sender_id,
        )
        db.add(message)
        db.flush()

        for part_data in data.parts:
            part = MessagePart(
                message_id=message.id,
                type=part_data.type,
                content=part_data.content,
                metadata_=part_data.metadata,
                event_id=part_data.event_id,
                raw_data=part_data.raw_data,
            )
            db.add(part)

        db.commit()
        db.refresh(message)

        # >>> 新增：触发搜索索引 <<<
        try:
            from app.service.search_indexer import SearchIndexerService
            indexer = SearchIndexerService()
            indexer.index_message(db, message)
        except Exception as e:
            # 索引失败不影响消息创建
            from loguru import logger
            logger.error(f"Failed to index message {message.id}: {e}")

        return message
```

## 4. 批量回填脚本

```python
# scripts/backfill_search_index.py

"""
批量回填搜索索引的独立脚本。

用法:
    python scripts/backfill_search_index.py
    python scripts/backfill_search_index.py --session-id <uuid>
    python scripts/backfill_search_index.py --regenerate-embeddings
    python scripts/backfill_search_index.py --batch-size 200
"""

import argparse
import sys
from uuid import UUID

sys.path.insert(0, ".")

from app.db.session import SessionLocal
from app.service.search_indexer import SearchIndexerService
from loguru import logger


def main():
    parser = argparse.ArgumentParser(description="Backfill message search index")
    parser.add_argument("--user-id", type=str, help="User ID to reindex")
    parser.add_argument("--session-id", type=str, default=None, help="Session ID to reindex")
    parser.add_argument("--regenerate-embeddings", action="store_true", help="Regenerate all embeddings")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size")
    args = parser.parse_args()

    if not args.user_id:
        logger.error("--user-id is required")
        sys.exit(1)

    db = SessionLocal()
    indexer = SearchIndexerService()

    try:
        result = indexer.reindex(
            db=db,
            user_id=UUID(args.user_id),
            session_id=UUID(args.session_id) if args.session_id else None,
            regenerate_embeddings=args.regenerate_embeddings,
            batch_size=args.batch_size,
        )
        logger.info(f"Reindex completed: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

## 5. Embedding 重试定时任务

可以通过 cron 或 APScheduler 定期运行：

```python
# scripts/retry_failed_embeddings.py

"""
重试失败的 embedding 生成。
建议每 5-10 分钟运行一次。
"""

import sys
sys.path.insert(0, ".")

from app.db.session import SessionLocal
from app.service.search_indexer import SearchIndexerService
from loguru import logger


def main():
    db = SessionLocal()
    indexer = SearchIndexerService()

    try:
        result = indexer.retry_failed_embeddings(db, batch_size=50)
        if result["retried"] > 0:
            logger.info(f"Embedding retry result: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

## 6. 索引生命周期

```
消息创建 ──► index_message() ──► search_index 记录
                                   (embedding_status: pending/completed/skipped)

消息更新 ──► update_index() ──► 更新 content_text + 重新生成 embedding

消息删除 ──► CASCADE 自动删除 search_index 记录
             (通过 FK ON DELETE CASCADE)

批量回填 ──► reindex() ──► 扫描所有未索引消息 ──► 批量创建记录 + embedding

重试失败 ──► retry_failed_embeddings() ──► 重试 status=failed 的记录
```
