# Step 3: 混合搜索服务实现

## 1. 概述

搜索系统分为两层：
- **HybridSearchEngine**（通用层）：封装 pg_trgm 模糊搜索、pgvector 向量搜索、RRF 融合算法，不绑定任何具体业务
- **SearchProvider**（类别层）：每种可搜索的内容类别实现一个 Provider，定义自己的表、列、过滤维度

核心变更（相比旧设计）：
- `SearchProvider` 新增 `get_embedding_table()` 和 `get_category()` 方法，移除 `get_embedding_column()`
- 向量搜索通过 JOIN `message_embedding` 表 + 动态 cast 实现，支持多模型
- 查询时从 `embedding_config` 获取活跃模型，自动构造正确的 cast 表达式

当前实现 `MessageSearchProvider`（消息搜索），未来可扩展 `DocumentSearchProvider` 等。

## 2. 架构分层

```
┌────────────────────────────────────────────────────────────┐
│  Tool Layer (面向 Agent)                                    │
│  search_messages(query, sender, group_name, ...)           │
│  search_documents(query, tag, folder, ...)      ← 未来     │
├────────────────────────────────────────────────────────────┤
│  SearchService (入口)                                       │
│  .search_messages(db, user_id, query, mode, ...)           │
├────────────────────────────────────────────────────────────┤
│  Provider Layer (按类别实现)                                 │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ MessageSearch     │  │ DocumentSearch   │  ← 未来        │
│  │ Provider          │  │ Provider         │                │
│  │ - table: message_ │  │ - table: doc_    │                │
│  │   search_index    │  │   search_index   │                │
│  │ - embed: message_ │  │ - embed: doc_    │                │
│  │   embedding       │  │   embedding      │                │
│  │ - category:       │  │ - category:      │                │
│  │   "message"       │  │   "document"     │                │
│  └──────────────────┘  └──────────────────┘                │
├────────────────────────────────────────────────────────────┤
│  HybridSearchEngine (通用搜索引擎)                          │
│  - _fuzzy_search(provider, query, ...)                     │
│  - _vector_search(provider, query, ...)  ← JOIN + 动态 cast│
│  - _rrf_fusion(list_a, list_b, weights)                    │
├────────────────────────────────────────────────────────────┤
│  Embedding Provider Layer                                   │
│  - EmbeddingService → OpenAIProvider / HTTPProvider         │
│  - embedding_config → 活跃模型配置                          │
└────────────────────────────────────────────────────────────┘
```

## 3. SearchProvider 抽象接口

```python
# app/service/search/provider.py

from abc import ABC, abstractmethod
from typing import Optional, Any
from uuid import UUID
from datetime import datetime


class SearchProvider(ABC):
    """
    搜索类别的抽象接口。

    每种可搜索的内容类型（消息、文档等）实现一个 Provider，
    定义自己的索引表结构、embedding 表、过滤维度、结果格式化逻辑。
    """

    @abstractmethod
    def get_table_name(self) -> str:
        """返回主索引表名（文本 + 元数据）。"""
        ...

    @abstractmethod
    def get_content_column(self) -> str:
        """返回用于模糊搜索的文本列名。"""
        ...

    @abstractmethod
    def get_embedding_table(self) -> str:
        """返回 embedding 表名（存储向量的独立表）。"""
        ...

    @abstractmethod
    def get_category(self) -> str:
        """返回业务类别名（对应 embedding_config.category）。"""
        ...

    @abstractmethod
    def get_select_columns(self) -> list[str]:
        """返回 SELECT 中需要查询的列列表。"""
        ...

    @abstractmethod
    def get_id_column(self) -> str:
        """返回结果去重用的 ID 列名。"""
        ...

    @abstractmethod
    def build_base_filters(
        self, user_id: UUID, **kwargs
    ) -> tuple[list[str], dict]:
        """
        构建该类别特有的 WHERE 条件。

        Returns:
            (where_clauses, params) 元组
            where_clauses 中的表别名: t = 主索引表, e = embedding 表
        """
        ...

    @abstractmethod
    def format_result(self, row: Any) -> dict:
        """将数据库行转换为统一的结果 dict。"""
        ...
```

> **变更说明**：相比旧接口，`get_embedding_column()` 被移除，新增 `get_embedding_table()` 和 `get_category()`。向量列统一在 `message_embedding.embedding` 中，由引擎自动处理。

## 4. HybridSearchEngine 通用实现

```python
# app/service/search/engine.py

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import text
from loguru import logger

from app.service.embedding import EmbeddingService, get_active_embedding_service
from app.service.search.provider import SearchProvider


class HybridSearchEngine:
    """
    通用混合搜索引擎。

    封装 pg_trgm 模糊搜索、pgvector 向量搜索和 RRF 融合算法。
    向量搜索通过 JOIN embedding 表 + 动态 halfvec cast 实现多模型支持。
    """

    RRF_K = 60

    def search(
        self,
        db: Session,
        provider: SearchProvider,
        query: str,
        mode: str = "hybrid",
        top_k: int = 20,
        fuzzy_weight: float = 0.4,
        vector_weight: float = 0.6,
        similarity_threshold: float = 0.1,
        vector_threshold: float = 0.3,
        extra_filters: Optional[tuple[list[str], dict]] = None,
    ) -> list[dict]:
        """
        执行混合搜索。

        Args:
            db: 数据库会话
            provider: 搜索类别 Provider
            query: 搜索查询
            mode: fuzzy | vector | hybrid
            top_k: 返回数量
            fuzzy_weight / vector_weight: RRF 权重
            similarity_threshold / vector_threshold: 阈值
            extra_filters: Provider 构建的 (where_clauses, params)
        """
        filters = extra_filters or ([], {})

        if mode == "fuzzy":
            return self._fuzzy_search(
                db, provider, query, filters,
                top_k, similarity_threshold,
            )
        elif mode == "vector":
            return self._vector_search(
                db, provider, query, filters,
                top_k, vector_threshold,
            )
        else:
            return self._hybrid_search(
                db, provider, query, filters, top_k,
                fuzzy_weight, vector_weight,
                similarity_threshold, vector_threshold,
            )

    def _fuzzy_search(
        self,
        db: Session,
        provider: SearchProvider,
        query: str,
        filters: tuple[list[str], dict],
        top_k: int,
        similarity_threshold: float,
    ) -> list[dict]:
        """通用 pg_trgm 模糊搜索（不涉及 embedding 表）。"""
        table = provider.get_table_name()
        content_col = provider.get_content_column()
        select_cols = ", ".join(
            f"t.{c}" for c in provider.get_select_columns()
        )

        where_clauses, params = filters
        where_clauses = where_clauses.copy()
        params = {**params}

        where_clauses.append(
            f"similarity(t.{content_col}, :query) > :threshold"
        )
        params["query"] = query
        params["threshold"] = similarity_threshold
        params["top_k"] = top_k

        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

        sql = text(f"""
            SELECT
                {select_cols},
                similarity(t.{content_col}, :query) AS fuzzy_score
            FROM {table} t
            WHERE {where_sql}
            ORDER BY fuzzy_score DESC
            LIMIT :top_k
        """)

        rows = db.execute(sql, params).fetchall()
        results = []
        for row in rows:
            result = provider.format_result(row)
            result["score"] = float(row.fuzzy_score)
            result["fuzzy_score"] = float(row.fuzzy_score)
            result["vector_score"] = 0.0
            results.append(result)
        return results

    def _vector_search(
        self,
        db: Session,
        provider: SearchProvider,
        query: str,
        filters: tuple[list[str], dict],
        top_k: int,
        vector_threshold: float,
    ) -> list[dict]:
        """
        通用 pgvector 向量搜索。

        核心变更：
        1. 从 embedding_config 查活跃 model_id
        2. 从注册表获取 model_config → index_cast, cosine_ops
        3. JOIN embedding 表 + WHERE model_id 过滤
        4. 使用 dynamic cast 表达式匹配 HNSW 部分索引
        """
        # 获取活跃模型配置
        embedding_svc, model_config = get_active_embedding_service(
            db, provider.get_category()
        )

        # 生成查询向量
        query_embedding = embedding_svc.generate_query_embedding(query)
        if query_embedding is None:
            logger.warning(f"Failed to generate query embedding: {query}")
            return []

        table = provider.get_table_name()
        emb_table = provider.get_embedding_table()
        cast = model_config.index_cast  # e.g. "halfvec(3072)"
        select_cols = ", ".join(
            f"t.{c}" for c in provider.get_select_columns()
        )

        where_clauses, params = filters
        where_clauses = where_clauses.copy()
        params = {**params}

        # 添加 embedding 特有的过滤
        where_clauses.extend([
            f"e.model_id = :model_id",
            f"e.status = 'completed'",
            f"(1 - (e.embedding::{cast} <=> :query_vec::{cast})) > :threshold",
        ])
        params["model_id"] = model_config.model_id
        params["query_vec"] = str(query_embedding)
        params["threshold"] = vector_threshold
        params["top_k"] = top_k

        where_sql = " AND ".join(where_clauses)

        sql = text(f"""
            SELECT
                {select_cols},
                (1 - (e.embedding::{cast} <=> :query_vec::{cast})) AS vector_score
            FROM {table} t
            JOIN {emb_table} e ON e.search_index_id = t.id
            WHERE {where_sql}
            ORDER BY e.embedding::{cast} <=> :query_vec::{cast}
            LIMIT :top_k
        """)

        rows = db.execute(sql, params).fetchall()
        results = []
        for row in rows:
            result = provider.format_result(row)
            result["score"] = float(row.vector_score)
            result["fuzzy_score"] = 0.0
            result["vector_score"] = float(row.vector_score)
            results.append(result)
        return results

    def _hybrid_search(
        self,
        db: Session,
        provider: SearchProvider,
        query: str,
        filters: tuple[list[str], dict],
        top_k: int,
        fuzzy_weight: float,
        vector_weight: float,
        similarity_threshold: float,
        vector_threshold: float,
    ) -> list[dict]:
        """RRF 融合搜索。"""
        fetch_k = top_k * 3

        fuzzy_results = self._fuzzy_search(
            db, provider, query, filters, fetch_k, similarity_threshold
        )
        vector_results = self._vector_search(
            db, provider, query, filters, fetch_k, vector_threshold
        )

        return self._rrf_fusion(
            fuzzy_results, vector_results,
            fuzzy_weight, vector_weight,
            provider.get_id_column(), top_k,
        )

    def _rrf_fusion(
        self,
        list_a: list[dict],
        list_b: list[dict],
        weight_a: float,
        weight_b: float,
        id_key: str,
        top_k: int,
    ) -> list[dict]:
        """
        RRF (Reciprocal Rank Fusion) 融合两路搜索结果。

        RRF_score(d) = w_a / (k + rank_a(d)) + w_b / (k + rank_b(d))
        """
        k = self.RRF_K

        ranks_a = {
            str(r[id_key]): rank
            for rank, r in enumerate(list_a, start=1)
        }
        ranks_b = {
            str(r[id_key]): rank
            for rank, r in enumerate(list_b, start=1)
        }

        all_results = {}
        for r in list_a + list_b:
            rid = str(r[id_key])
            if rid not in all_results:
                all_results[rid] = r

        scored = []
        for rid, result in all_results.items():
            rank_a = ranks_a.get(rid)
            rank_b = ranks_b.get(rid)

            rrf_a = (1.0 / (k + rank_a)) if rank_a else 0.0
            rrf_b = (1.0 / (k + rank_b)) if rank_b else 0.0

            result["score"] = weight_a * rrf_a + weight_b * rrf_b
            result["fuzzy_score"] = (
                list_a[rank_a - 1]["fuzzy_score"] if rank_a else 0.0
            )
            result["vector_score"] = (
                list_b[rank_b - 1]["vector_score"] if rank_b else 0.0
            )
            scored.append(result)

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]
```

## 5. MessageSearchProvider 实现

```python
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
            "message_id", "session_id", "session_type",
            "session_name", "topic_id", "content_text",
            "sender_name", "role", "message_created_at",
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
```

## 6. 对外入口：SearchService（便捷层）

```python
# app/service/search/search_service.py

from typing import Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.orm import Session

from app.service.search.engine import HybridSearchEngine
from app.service.search.message_provider import MessageSearchProvider


class SearchService:
    """搜索服务入口。封装 Provider + Engine 的组合调用。"""

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
```

## 7. 扩展新类别的步骤清单

以添加"文档搜索"为例：

```
1. 创建索引表 (2 张)
   → alembic migration: document_search_index + document_embedding
   → document_search_index: doc_id, user_id, title, content_text, ...
   → document_embedding: search_index_id, model_id, embedding(halfvec), status

2. 添加 HNSW 部分索引
   → 与 message_embedding 相同的模式，每模型一个 HNSW 部分索引

3. 实现 Provider
   → class DocumentSearchProvider(SearchProvider)
   → get_table_name() → "document_search_index"
   → get_embedding_table() → "document_embedding"
   → get_category() → "document"

4. 注册到 SearchService
   → SearchService.search_documents(...)

5. 创建 Agent Tool
   → @ToolRegistry.register("search_documents", ...)

6. 添加 embedding_config 记录
   → INSERT INTO embedding_config (category, model_id) VALUES ('document', 'openai-3-large')
```

不需要修改 `HybridSearchEngine`、`EmbeddingService` 或 RRF 算法。

## 8. 目录结构

```
app/service/search/
├── __init__.py
├── provider.py              # SearchProvider ABC (updated: +get_embedding_table, +get_category)
├── engine.py                # HybridSearchEngine (updated: JOIN + dynamic cast)
├── message_provider.py      # 消息搜索 Provider (updated)
└── search_service.py        # SearchService 入口

app/service/
├── embedding.py             # EmbeddingProvider ABC + OpenAI/HTTP + EmbeddingService + factory
├── context_retrieval.py     # 消息上下文检索
└── search_indexer.py        # 消息索引管线 (updated: 双表写入)

app/config/
├── __init__.py
└── embedding.py             # EmbeddingModelConfig 注册表
```

## 9. 搜索模式对比

| 模式 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| `fuzzy` | 精确关键词、人名、ID | 快速、无需 API 调用 | 不理解语义 |
| `vector` | 语义相似、意图搜索 | 理解语义、跨语言 | 需要 API 调用 |
| `hybrid` | 通用搜索（默认） | 两者优势结合 | 延迟最高 |

## 10. 性能优化策略

### 查询优化
- pg_trgm 使用 GIN 索引，`similarity()` 查询走索引扫描
- pgvector 使用 HNSW 部分索引，`<=>` + WHERE model_id 走近似搜索
- 结构化过滤先缩小候选集，再做文本/向量搜索
- halfvec cast 表达式匹配 HNSW 部分索引，避免全表扫描

### 搜索性能参考
- 纯结构化过滤：10 万条 < 10ms
- pg_trgm 查询：10 万条 < 50ms（GIN 索引）
- pgvector HNSW 查询：10 万条 < 20ms（部分索引 + halfvec）
- 混合搜索总延迟：~100ms（纯文本）/ ~300ms（含 embedding API）
