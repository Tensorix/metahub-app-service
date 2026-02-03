# app/service/search_indexer.py

"""Search indexer service — manages dual-table writes (search_index + embedding)."""

import re
from typing import Optional
from uuid import UUID

from loguru import logger
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import config
from app.db.model.message import Message
from app.db.model.message_embedding import MessageEmbedding
from app.db.model.message_search_index import MessageSearchIndex
from app.db.model.session import Session as SessionModel
from app.service.embedding import get_active_embedding_service


def extract_searchable_text(message: Message) -> str:
    """Extract searchable text from all message parts."""
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
    """Preprocess extracted text."""
    if not text:
        return ""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class SearchIndexerService:
    """Search indexer service — dual-table writes (search_index + embedding)."""

    # ========== Real-time Indexing ==========

    def index_message(
        self, db: Session, message: Message
    ) -> Optional[MessageSearchIndex]:
        """
        Create search index for a single message.
        Called after MessageService.create_message().

        Flow:
        1. Check session type (only index pm/group)
        2. Extract text content
        3. Write message_search_index (text + metadata)
        4. Get active embedding model
        5. Generate embedding → write message_embedding
        """
        session = message.session
        if session.type not in ("pm", "group"):
            return None

        content_text = preprocess_text(extract_searchable_text(message))
        if not content_text:
            return None

        sender_name = message.sender.name if message.sender else None
        session_name = session.name

        # 1. Write search_index (text only, no embedding)
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
        )
        db.add(search_index)
        db.flush()  # Get search_index.id

        # 2. 创建 embedding 记录（在后台任务中调用时才生成向量）
        # 注意：此方法在后台任务中调用，不会阻塞消息创建接口
        if config.SEARCH_SYNC_EMBEDDING:
            # 立即生成 embedding（在后台任务中执行，不阻塞）
            self._generate_embedding_for_index(db, search_index, content_text)
        else:
            # 创建 pending 状态，等待定时任务处理
            self._create_pending_embedding(db, search_index)

        db.commit()
        db.refresh(search_index)
        return search_index

    def _generate_embedding_for_index(
        self,
        db: Session,
        search_index: MessageSearchIndex,
        content_text: str,
    ) -> Optional[MessageEmbedding]:
        """Generate embedding for a search_index and write to message_embedding."""
        try:
            embedding_svc, model_config = get_active_embedding_service(db)
            embedding_vec = embedding_svc.generate_embedding(content_text)

            if embedding_vec is None:
                # Text too short, don't create embedding record
                return None

            emb_record = MessageEmbedding(
                search_index_id=search_index.id,
                model_id=model_config.model_id,
                embedding=embedding_vec,
                status="completed",
            )
            db.add(emb_record)
            return emb_record

        except Exception as e:
            logger.error(f"Embedding failed for index {search_index.id}: {e}")
            # Write failed record for retry
            emb_record = MessageEmbedding(
                search_index_id=search_index.id,
                model_id="unknown",  # Will be updated on retry
                embedding=[0.0],  # Placeholder
                status="failed",
            )
            db.add(emb_record)
            return emb_record

    def _create_pending_embedding(
        self,
        db: Session,
        search_index: MessageSearchIndex,
    ) -> MessageEmbedding:
        """Create a pending embedding record for background processing."""
        try:
            _, model_config = get_active_embedding_service(db)
            model_id = model_config.model_id
        except Exception:
            model_id = "unknown"
        
        emb_record = MessageEmbedding(
            search_index_id=search_index.id,
            model_id=model_id,
            embedding=[0.0],  # Placeholder
            status="pending",
        )
        db.add(emb_record)
        return emb_record

    def update_index(
        self, db: Session, message: Message
    ) -> Optional[MessageSearchIndex]:
        """Update existing message search index (when message content changes)."""
        index = (
            db.query(MessageSearchIndex)
            .filter(MessageSearchIndex.message_id == message.id)
            .first()
        )

        if not index:
            return self.index_message(db, message)

        content_text = preprocess_text(extract_searchable_text(message))
        if not content_text:
            db.delete(index)  # CASCADE will delete message_embedding
            db.commit()
            return None

        # Update text
        index.content_text = content_text
        index.topic_id = message.topic_id
        index.sender_name = message.sender.name if message.sender else None
        index.session_name = (
            message.session.name if message.session else None
        )
        index.indexed_at = func.now()

        # Delete old embedding, regenerate
        if index.embedding:
            db.delete(index.embedding)
            db.flush()

        if config.SEARCH_SYNC_EMBEDDING:
            self._generate_embedding_for_index(db, index, content_text)

        db.commit()
        db.refresh(index)
        return index

    def delete_index(self, db: Session, message_id: UUID) -> bool:
        """Delete message search index (CASCADE auto-deletes embedding)."""
        index = (
            db.query(MessageSearchIndex)
            .filter(MessageSearchIndex.message_id == message_id)
            .first()
        )
        if index:
            db.delete(index)
            db.commit()
            return True
        return False

    # ========== Batch Backfill ==========

    def reindex(
        self,
        db: Session,
        user_id: UUID,
        session_id: Optional[UUID] = None,
        regenerate_embeddings: bool = False,
        batch_size: int = 100,
    ) -> dict:
        """
        Batch rebuild search indexes.

        Flow:
        1. Query all qualifying messages
        2. Batch create message_search_index records
        3. Get active model
        4. Batch generate embeddings → write message_embedding
        """
        stats = {
            "status": "started",
            "total_messages": 0,
            "indexed_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
        }

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
            existing_ids = {
                row[0]
                for row in db.query(MessageSearchIndex.message_id)
                .filter(MessageSearchIndex.user_id == user_id)
                .all()
            }
        else:
            existing_ids = set()

        # Get active model
        embedding_svc, model_config = get_active_embedding_service(db)

        offset = 0
        while True:
            messages = (
                query.order_by(Message.created_at.asc())
                .offset(offset)
                .limit(batch_size)
                .all()
            )
            if not messages:
                break

            stats["total_messages"] += len(messages)
            texts_to_embed = []
            indices_to_create = []

            for message in messages:
                if (
                    message.id in existing_ids
                    and not regenerate_embeddings
                ):
                    stats["skipped_count"] += 1
                    continue

                content_text = preprocess_text(
                    extract_searchable_text(message)
                )
                if not content_text:
                    stats["skipped_count"] += 1
                    continue

                session = message.session
                indices_to_create.append(
                    {
                        "message": message,
                        "content_text": content_text,
                        "session_type": session.type,
                        "session_name": session.name,
                        "sender_name": (
                            message.sender.name if message.sender else None
                        ),
                    }
                )
                texts_to_embed.append(content_text)

            # Batch generate embeddings
            embeddings = []
            if texts_to_embed:
                try:
                    embeddings = embedding_svc.generate_embeddings_batch(
                        texts_to_embed
                    )
                except Exception as e:
                    logger.error(f"Batch embedding failed: {e}")
                    embeddings = [None] * len(texts_to_embed)

            # Create/update records (dual-table)
            for i, item in enumerate(indices_to_create):
                message = item["message"]
                embedding = embeddings[i] if i < len(embeddings) else None

                try:
                    if regenerate_embeddings:
                        existing = (
                            db.query(MessageSearchIndex)
                            .filter(
                                MessageSearchIndex.message_id == message.id
                            )
                            .first()
                        )
                        if existing:
                            existing.content_text = item["content_text"]
                            existing.indexed_at = func.now()
                            # Delete old embedding
                            if existing.embedding:
                                db.delete(existing.embedding)
                                db.flush()
                            # Write new embedding
                            if embedding:
                                emb = MessageEmbedding(
                                    search_index_id=existing.id,
                                    model_id=model_config.model_id,
                                    embedding=embedding,
                                    status="completed",
                                )
                                db.add(emb)
                        else:
                            self._create_index_records(
                                db, message, item, embedding, model_config
                            )
                    else:
                        self._create_index_records(
                            db, message, item, embedding, model_config
                        )
                    stats["indexed_count"] += 1
                except Exception as e:
                    logger.error(f"Failed to index message {message.id}: {e}")
                    stats["failed_count"] += 1

            db.commit()
            offset += batch_size

        stats["status"] = "completed"
        return stats

    def _create_index_records(
        self,
        db: Session,
        message: Message,
        item: dict,
        embedding: Optional[list[float]],
        model_config,
    ):
        """Create search_index + embedding dual-table records."""
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
        )
        db.add(search_index)
        db.flush()

        if embedding:
            emb = MessageEmbedding(
                search_index_id=search_index.id,
                model_id=model_config.model_id,
                embedding=embedding,
                status="completed",
            )
            db.add(emb)

    # ========== Embedding Retry ==========

    def process_pending_embeddings(
        self, db: Session, batch_size: int = 50
    ) -> dict:
        """Process pending embeddings in background."""
        stats = {"processed": 0, "succeeded": 0, "failed": 0}

        pending_records = (
            db.query(MessageEmbedding)
            .filter(MessageEmbedding.status == "pending")
            .limit(batch_size)
            .all()
        )

        if not pending_records:
            return stats

        embedding_svc, model_config = get_active_embedding_service(db)

        # Get corresponding content_text
        index_ids = [r.search_index_id for r in pending_records]
        search_indices = {
            si.id: si
            for si in db.query(MessageSearchIndex)
            .filter(MessageSearchIndex.id.in_(index_ids))
            .all()
        }

        texts = []
        for record in pending_records:
            si = search_indices.get(record.search_index_id)
            texts.append(si.content_text if si else "")

        stats["processed"] = len(texts)

        try:
            embeddings = embedding_svc.generate_embeddings_batch(texts)
            for i, record in enumerate(pending_records):
                if embeddings[i]:
                    record.embedding = embeddings[i]
                    record.model_id = model_config.model_id
                    record.status = "completed"
                    stats["succeeded"] += 1
                else:
                    record.status = "failed"
                    stats["failed"] += 1
        except Exception as e:
            logger.error(f"Process pending embeddings batch failed: {e}")
            for record in pending_records:
                record.status = "failed"
            stats["failed"] = len(pending_records)

        db.commit()
        return stats

    def retry_failed_embeddings(
        self, db: Session, batch_size: int = 50
    ) -> dict:
        """Retry previously failed embedding generation."""
        stats = {"retried": 0, "succeeded": 0, "still_failed": 0}

        failed_records = (
            db.query(MessageEmbedding)
            .filter(MessageEmbedding.status == "failed")
            .limit(batch_size)
            .all()
        )

        if not failed_records:
            return stats

        embedding_svc, model_config = get_active_embedding_service(db)

        # Get corresponding content_text
        index_ids = [r.search_index_id for r in failed_records]
        search_indices = {
            si.id: si
            for si in db.query(MessageSearchIndex)
            .filter(MessageSearchIndex.id.in_(index_ids))
            .all()
        }

        texts = []
        for record in failed_records:
            si = search_indices.get(record.search_index_id)
            texts.append(si.content_text if si else "")

        stats["retried"] = len(texts)

        try:
            embeddings = embedding_svc.generate_embeddings_batch(texts)
            for i, record in enumerate(failed_records):
                if embeddings[i]:
                    record.embedding = embeddings[i]
                    record.model_id = model_config.model_id
                    record.status = "completed"
                    stats["succeeded"] += 1
                else:
                    stats["still_failed"] += 1
        except Exception as e:
            logger.error(f"Retry embeddings batch failed: {e}")
            stats["still_failed"] = len(failed_records)

        db.commit()
        return stats

    # ========== Statistics ==========

    def get_stats(self, db: Session, user_id: UUID) -> dict:
        """Get user's search index statistics."""
        total = (
            db.query(MessageSearchIndex)
            .filter(MessageSearchIndex.user_id == user_id)
            .count()
        )

        # Embedding stats from message_embedding table
        from sqlalchemy import func as sa_func

        emb_stats = (
            db.query(
                MessageEmbedding.status,
                sa_func.count(MessageEmbedding.id),
            )
            .join(
                MessageSearchIndex,
                MessageEmbedding.search_index_id == MessageSearchIndex.id,
            )
            .filter(MessageSearchIndex.user_id == user_id)
            .group_by(MessageEmbedding.status)
            .all()
        )
        status_counts = dict(emb_stats)

        return {
            "total_indexed": total,
            "embedding_completed": status_counts.get("completed", 0),
            "embedding_pending": status_counts.get("pending", 0),
            "embedding_failed": status_counts.get("failed", 0),
            "no_embedding": total - sum(status_counts.values()),
        }
