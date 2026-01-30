# Step 4: 父子上下文检索实现

## 1. 概述

当搜索命中某条消息时，需要返回该消息的上下文环境，帮助用户理解消息所处的对话语境。

**核心逻辑**：
- 如果命中消息属于某个 **topic** → 返回该 topic 下的所有消息
- 如果命中消息不属于任何 topic → 返回该消息在 session 中的前后 **N** 条消息

## 2. ContextRetrievalService 实现

```python
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
```

## 3. 上下文检索流程图

```
搜索结果 [hit_1, hit_2, hit_3, ...]
              │
              ▼
    ┌─────────────────────┐
    │ get_contexts_batch() │
    └─────────┬───────────┘
              │
    ┌─────────▼──────────────────────┐
    │  对每个 hit 判断 topic_id:      │
    │                                │
    │  hit.topic_id != None:         │
    │    → _get_topic_context()      │
    │    → 缓存 topic 结果           │
    │                                │
    │  hit.topic_id == None:         │
    │    → _get_window_context()     │
    │    → 基于时间前后取 N 条        │
    └────────────────────────────────┘
              │
              ▼
    [
      {
        search_result: { message_id, score, ... },
        context: {
          type: "topic",
          messages: [m1, m2, m3, ...],  ← 整个 topic
          hit_message_id: UUID
        }
      },
      {
        search_result: { message_id, score, ... },
        context: {
          type: "window",
          messages: [m_-5, ..., m_hit, ..., m_+5],  ← 前后 N 条
          hit_message_id: UUID,
          window_before: 5,
          window_after: 5
        }
      }
    ]
```

## 4. 边界情况处理

### 场景 1：Topic 下只有一条消息
- 正常返回，`messages` 数组只有一个元素
- `total_count = 1`

### 场景 2：消息在 session 开头，前面不够 N 条
- `before_messages` 少于 N 条，`window_before` 反映实际数量
- 不会填充空消息

### 场景 3：消息已被软删除
- `is_deleted = True` 的消息不会出现在上下文中
- 命中消息本身如果被删除，`hit_message` 为 None，上下文仍返回周围消息

### 场景 4：同一 topic 有多条命中
- 通过 `topic_cache` 避免重复查询
- 每个命中消息独立标记 `hit_message_id`

### 场景 5：Topic 被软删除
- Topic 被软删除但消息未删除时，仍然通过 `topic_id` 关联返回消息
- Topic 名称可能为 None（topic 已删除的情况）

## 5. 性能考量

### 查询效率
- Topic 模式：利用 `idx_search_topic` 索引，O(1) 查找 topic 下的消息
- Window 模式：利用 `idx_search_session_created` 复合索引，高效范围查询
- 批量模式：topic 缓存避免重复查询

### 数据量控制
- Topic 模式：topic 消息数通常有限（数十到数百条），不做额外分页
- Window 模式：严格限制为 2*N+1 条消息
- 如果 topic 下消息过多（>500 条），建议在 API 层做分页处理（见 Step 5）

### N+1 查询问题
- `Message` 的 `parts` relationship 使用 eager loading 或在序列化时 joinedload
- 可以在查询时加 `.options(joinedload(Message.parts))` 避免 N+1
