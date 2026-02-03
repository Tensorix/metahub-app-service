# Step 6: 实时索引 + 批量回填 + 模型切换

## 1. 概述

索引管线分为三个部分：
- **实时索引**：每条新消息创建后自动建立搜索索引（双表写入）
- **批量回填**：为存量消息批量构建索引和 embedding
- **模型切换**：通过 Admin API 切换活跃 embedding 模型，触发 re-embed

核心变更（相比旧设计）：
- 写入分为两步：先写 `message_search_index`（文本），再写 `message_embedding`（向量）
- embedding 生成使用活跃模型（从 `embedding_config` 获取）
- 新增模型切换 API 和后台 re-embed 任务

## 2. SearchIndexerService 实现

```python
# app/service/search_indexer.py

import re
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from loguru import logger

from app.db.model.message import Message
from app.db.model.message_search_index import MessageSearchIndex
from app.db.model.message_embedding import MessageEmbedding
from app.db.model.session import Session as SessionModel
from app.service.embedding import get_active_embedding_service
from app.config import config


def extract_searchable_text(message: Message) -> str:
    """从消息的所有 parts 中提取可搜索文本。"""
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
    """搜索索引管理服务（双表写入：search_index + embedding）"""

    # ========== 实时索引 ==========

    def index_message(
        self, db: Session, message: Message
    ) -> Optional[MessageSearchIndex]:
        """
        为单条消息创建搜索索引。
        在 MessageService.create_message() 之后调用。

        流程:
        1. 检查 session 类型是否为 pm/group
        2. 提取文本内容
        3. 写入 message_search_index（文本 + 元数据）
        4. 获取活跃 embedding 模型
        5. 生成 embedding → 写入 message_embedding
        """
        session = message.session
        if session.type not in ("pm", "group"):
            return None

        content_text = preprocess_text(extract_searchable_text(message))
        if not content_text:
            return None

        sender_name = message.sender.name if message.sender else None
        session_name = session.name

        # 1. 写入 search_index（纯文本，无 embedding）
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
        db.flush()  # 获取 search_index.id

        # 2. 生成 embedding → 写入 message_embedding
        if config.SEARCH_SYNC_EMBEDDING:
            self._generate_embedding_for_index(
                db, search_index, content_text
            )

        db.commit()
        db.refresh(search_index)
        return search_index

    def _generate_embedding_for_index(
        self,
        db: Session,
        search_index: MessageSearchIndex,
        content_text: str,
    ) -> Optional[MessageEmbedding]:
        """为一条 search_index 生成 embedding 并写入 message_embedding。"""
        try:
            embedding_svc, model_config = get_active_embedding_service(db)
            embedding_vec = embedding_svc.generate_embedding(content_text)

            if embedding_vec is None:
                # 文本过短，不创建 embedding 记录
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
            logger.error(
                f"Embedding failed for index {search_index.id}: {e}"
            )
            # 写入 failed 记录，后续可重试
            emb_record = MessageEmbedding(
                search_index_id=search_index.id,
                model_id="unknown",  # 会在重试时更新
                embedding=[0.0],     # placeholder
                status="failed",
            )
            db.add(emb_record)
            return emb_record

    def update_index(
        self, db: Session, message: Message
    ) -> Optional[MessageSearchIndex]:
        """更新已有消息的搜索索引（消息内容变更时调用）。"""
        index = db.query(MessageSearchIndex).filter(
            MessageSearchIndex.message_id == message.id
        ).first()

        if not index:
            return self.index_message(db, message)

        content_text = preprocess_text(extract_searchable_text(message))
        if not content_text:
            db.delete(index)  # CASCADE 会自动删除 message_embedding
            db.commit()
            return None

        # 更新文本
        index.content_text = content_text
        index.topic_id = message.topic_id
        index.sender_name = message.sender.name if message.sender else None
        index.session_name = message.session.name if message.session else None
        index.indexed_at = func.now()

        # 删除旧 embedding，重新生成
        if index.embedding:
            db.delete(index.embedding)
            db.flush()

        if config.SEARCH_SYNC_EMBEDDING:
            self._generate_embedding_for_index(db, index, content_text)

        db.commit()
        db.refresh(index)
        return index

    def delete_index(self, db: Session, message_id: UUID) -> bool:
        """删除消息的搜索索引（CASCADE 自动删除 embedding）。"""
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
        1. 查询所有符合条件的消息
        2. 批量创建 message_search_index 记录
        3. 获取活跃模型
        4. 批量生成 embedding → 写入 message_embedding
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
                row[0] for row in
                db.query(MessageSearchIndex.message_id)
                .filter(MessageSearchIndex.user_id == user_id)
                .all()
            }
        else:
            existing_ids = set()

        # 获取活跃模型
        embedding_svc, model_config = get_active_embedding_service(db)

        offset = 0
        while True:
            messages = (
                query.order_by(Message.created_at.asc())
                .offset(offset).limit(batch_size).all()
            )
            if not messages:
                break

            stats["total_messages"] += len(messages)
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
                indices_to_create.append({
                    "message": message,
                    "content_text": content_text,
                    "session_type": session.type,
                    "session_name": session.name,
                    "sender_name": (
                        message.sender.name if message.sender else None
                    ),
                })
                texts_to_embed.append(content_text)

            # 批量生成 embeddings
            embeddings = []
            if texts_to_embed:
                try:
                    embeddings = embedding_svc.generate_embeddings_batch(
                        texts_to_embed
                    )
                except Exception as e:
                    logger.error(f"Batch embedding failed: {e}")
                    embeddings = [None] * len(texts_to_embed)

            # 创建/更新记录（双表）
            for i, item in enumerate(indices_to_create):
                message = item["message"]
                embedding = embeddings[i] if i < len(embeddings) else None

                try:
                    if regenerate_embeddings:
                        existing = db.query(MessageSearchIndex).filter(
                            MessageSearchIndex.message_id == message.id
                        ).first()
                        if existing:
                            existing.content_text = item["content_text"]
                            existing.indexed_at = func.now()
                            # 删除旧 embedding
                            if existing.embedding:
                                db.delete(existing.embedding)
                                db.flush()
                            # 写入新 embedding
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
        """创建 search_index + embedding 双表记录。"""
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

    # ========== Embedding 重试 ==========

    def retry_failed_embeddings(
        self, db: Session, batch_size: int = 50
    ) -> dict:
        """重试之前失败的 embedding 生成。"""
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

        # 获取对应的 content_text
        index_ids = [r.search_index_id for r in failed_records]
        search_indices = {
            si.id: si for si in
            db.query(MessageSearchIndex)
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

    # ========== 统计信息 ==========

    def get_stats(self, db: Session, user_id: UUID) -> dict:
        """获取用户的搜索索引统计信息。"""
        total = db.query(MessageSearchIndex).filter(
            MessageSearchIndex.user_id == user_id
        ).count()

        # embedding 统计从 message_embedding 表获取
        from sqlalchemy import func as sa_func
        emb_stats = (
            db.query(
                MessageEmbedding.status,
                sa_func.count(MessageEmbedding.id),
            )
            .join(MessageSearchIndex,
                  MessageEmbedding.search_index_id == MessageSearchIndex.id)
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
```

## 3. 集成到 MessageService

在 `MessageService.create_message()` 之后触发索引：

```python
# app/service/session.py 中修改 MessageService

class MessageService:

    @staticmethod
    def create_message(db: Session, data: MessageCreate, user_id: UUID) -> Message:
        message = Message(...)
        db.add(message)
        db.flush()
        # ... create parts ...
        db.commit()
        db.refresh(message)

        # >>> 触发搜索索引（双表写入）<<<
        try:
            from app.service.search_indexer import SearchIndexerService
            indexer = SearchIndexerService()
            indexer.index_message(db, message)
        except Exception as e:
            from loguru import logger
            logger.error(f"Failed to index message {message.id}: {e}")

        return message
```

## 4. 模型切换 API

### 4.1 API 端点

```
POST /api/v1/admin/embedding/switch
Body: { "category": "message", "model_id": "openai-3-small" }

GET  /api/v1/admin/embedding/status?category=message
GET  /api/v1/admin/embedding/models
```

### 4.2 切换流程（纯 DML，零 DDL）

```
POST /api/v1/admin/embedding/switch
  { "category": "message", "model_id": "openai-3-small" }
        │
        ▼
1. 校验 model_id 在 EMBEDDING_MODELS 注册表中存在
2. 检查对应的 HNSW 部分索引已建（通过 pg_indexes 查询）
3. 更新 embedding_config (category='message' → model_id='openai-3-small')
4. 启动后台 re-embed 任务:
   a. DELETE FROM message_embedding
      WHERE search_index_id IN (
        SELECT id FROM message_search_index WHERE user_id IN (...)
      )
      AND model_id != 'openai-3-small'
   b. 批量读取 message_search_index.content_text
   c. 调用新模型 API 生成 embedding
   d. INSERT INTO message_embedding (search_index_id, model_id, embedding, status)
5. 返回 { "status": "switching", "task_id": "..." }
```

### 4.3 切换期间的搜索行为

- **模糊搜索**：完全不受影响（仅查 `message_search_index`）
- **向量搜索**：
  - 已有新模型 embedding 的记录可正常搜索
  - 尚未 re-embed 的记录暂时不可搜索
  - 可配置降级策略：完全禁用向量搜索 / 仅返回已完成的结果

### 4.4 Router 实现

```python
# app/router/v1/admin_embedding.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_active_superuser
from app.db.model.embedding_config import EmbeddingConfig
from app.config.embedding import EMBEDDING_MODELS, get_model_config

router = APIRouter(prefix="/admin/embedding", tags=["admin-embedding"])


class SwitchRequest(BaseModel):
    category: str
    model_id: str


@router.post("/switch")
def switch_model(
    req: SwitchRequest,
    db: Session = Depends(get_db),
    _user = Depends(get_current_active_superuser),
):
    """切换指定类别的活跃 embedding 模型。"""
    if req.model_id not in EMBEDDING_MODELS:
        raise HTTPException(400, f"Unknown model: {req.model_id}")

    # 更新或插入 embedding_config
    cfg = db.query(EmbeddingConfig).filter(
        EmbeddingConfig.category == req.category
    ).first()
    if cfg:
        cfg.model_id = req.model_id
    else:
        cfg = EmbeddingConfig(
            category=req.category, model_id=req.model_id
        )
        db.add(cfg)
    db.commit()

    # TODO: 启动后台 re-embed 任务

    return {
        "status": "switched",
        "category": req.category,
        "model_id": req.model_id,
    }


@router.get("/status")
def get_status(
    category: str = "message",
    db: Session = Depends(get_db),
    _user = Depends(get_current_active_superuser),
):
    """查询指定类别的 embedding 状态。"""
    cfg = db.query(EmbeddingConfig).filter(
        EmbeddingConfig.category == category
    ).first()
    model_id = cfg.model_id if cfg else "openai-3-large"
    model_config = get_model_config(model_id)

    from app.service.search_indexer import SearchIndexerService
    from app.db.model.message_embedding import MessageEmbedding
    from sqlalchemy import func

    total_indices = db.query(func.count()).select_from(
        __import__('app.db.model.message_search_index',
                    fromlist=['MessageSearchIndex']).MessageSearchIndex
    ).scalar()

    total_embeddings = db.query(func.count()).select_from(
        MessageEmbedding
    ).filter(
        MessageEmbedding.model_id == model_id,
        MessageEmbedding.status == 'completed',
    ).scalar()

    return {
        "category": category,
        "active_model": model_id,
        "model_dimensions": model_config.dimensions,
        "model_provider": model_config.provider,
        "total_indices": total_indices,
        "completed_embeddings": total_embeddings,
        "coverage": (
            f"{total_embeddings / total_indices * 100:.1f}%"
            if total_indices > 0 else "N/A"
        ),
    }


@router.get("/models")
def list_models(
    _user = Depends(get_current_active_superuser),
):
    """列出所有已注册的 embedding 模型。"""
    return {
        "models": [
            {
                "model_id": cfg.model_id,
                "provider": cfg.provider,
                "model_name": cfg.model_name,
                "dimensions": cfg.dimensions,
                "index_slug": cfg.index_slug,
            }
            for cfg in EMBEDDING_MODELS.values()
        ]
    }
```

## 5. 批量回填脚本

```python
# scripts/backfill_search_index.py

"""
批量回填搜索索引的独立脚本。

用法:
    python scripts/backfill_search_index.py --user-id <uuid>
    python scripts/backfill_search_index.py --user-id <uuid> --session-id <uuid>
    python scripts/backfill_search_index.py --user-id <uuid> --regenerate-embeddings
    python scripts/backfill_search_index.py --user-id <uuid> --batch-size 200
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
    parser.add_argument("--user-id", type=str, required=True)
    parser.add_argument("--session-id", type=str, default=None)
    parser.add_argument("--regenerate-embeddings", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

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

## 6. Embedding 重试定时任务

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

## 7. 索引生命周期

```
消息创建 ──► index_message()
              ├── message_search_index 记录（文本 + 元数据）
              └── message_embedding 记录（活跃模型的向量）

消息更新 ──► update_index()
              ├── 更新 message_search_index.content_text
              ├── 删除旧 message_embedding
              └── 重新生成 embedding

消息删除 ──► CASCADE 自动删除 search_index + embedding
             (通过 FK ON DELETE CASCADE)

批量回填 ──► reindex()
              ├── 扫描未索引消息
              ├── 批量创建 search_index
              └── 批量生成 embedding → 写入 message_embedding

重试失败 ──► retry_failed_embeddings()
              └── 重试 status=failed 的 message_embedding 记录

模型切换 ──► POST /admin/embedding/switch
              ├── 更新 embedding_config
              ├── 后台删除旧模型 embedding
              └── 后台用新模型 re-embed 所有记录
```
