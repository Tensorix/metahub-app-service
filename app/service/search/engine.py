# app/service/search/engine.py

from typing import Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import text
from loguru import logger

from app.service.embedding import get_active_embedding_service
from app.service.search.provider import SearchProvider


class HybridSearchEngine:
    """
    通用混合搜索引擎。

    封装 pg_trgm 模糊搜索、pgvector 向量搜索和 RRF 融合算法。
    不绑定具体业务类别——通过 SearchProvider 注入表结构和过滤逻辑。

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
            fuzzy_weight / vector_weight: 权重
            similarity_threshold / vector_threshold: 阈值
            extra_filters: Provider 构建的 (where_clauses, params)

        Returns:
            排序后的结果列表
        """
        filters = extra_filters or ([], {})

        if mode == "fuzzy":
            return self._fuzzy_search(
                db,
                provider,
                query,
                filters,
                top_k,
                similarity_threshold,
            )
        elif mode == "vector":
            return self._vector_search(
                db, provider, query, filters, top_k, vector_threshold
            )
        elif mode == "filter_only":
            return self._filter_only_search(
                db, provider, filters, top_k
            )
        else:
            return self._hybrid_search(
                db,
                provider,
                query,
                filters,
                top_k,
                fuzzy_weight,
                vector_weight,
                similarity_threshold,
                vector_threshold,
            )

    def _filter_only_search(
        self,
        db: Session,
        provider: SearchProvider,
        filters: tuple[list[str], dict],
        top_k: int,
    ) -> list[dict]:
        """
        纯过滤模式搜索（不使用 fuzzy 或 vector）。
        
        当 query 为空但有其他过滤条件（如 sender, session_name）时使用。
        按时间倒序返回最近的消息。
        """
        table = provider.get_table_name()
        select_cols = ", ".join(
            f"t.{c}" for c in provider.get_select_columns()
        )

        where_clauses, params = filters
        params = {**params, "top_k": top_k}

        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

        sql = text(
            f"""
            SELECT {select_cols}
            FROM {table} t
            WHERE {where_sql}
            ORDER BY t.message_created_at DESC
            LIMIT :top_k
        """
        )

        rows = db.execute(sql, params).fetchall()
        results = []
        for row in rows:
            result = provider.format_result(row)
            result["score"] = 1.0  # 过滤模式不计算相似度
            result["fuzzy_score"] = 0.0
            result["vector_score"] = 0.0
            results.append(result)
        return results

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

        sql = text(
            f"""
            SELECT
                {select_cols},
                similarity(t.{content_col}, :query) AS fuzzy_score
            FROM {table} t
            WHERE {where_sql}
            ORDER BY fuzzy_score DESC
            LIMIT :top_k
        """
        )

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
        # 将向量转换为 PostgreSQL 数组字符串格式
        vec_str = "[" + ",".join(map(str, query_embedding)) + "]"
        
        where_clauses.extend(
            [
                f"e.model_id = :model_id",
                f"e.status = 'completed'",
                f"(1 - (e.embedding::{cast} <=> '{vec_str}'::{cast})) > :threshold",
            ]
        )
        params["model_id"] = model_config.model_id
        params["threshold"] = vector_threshold
        params["top_k"] = top_k

        where_sql = " AND ".join(where_clauses)

        sql = text(
            f"""
            SELECT
                {select_cols},
                (1 - (e.embedding::{cast} <=> '{vec_str}'::{cast})) AS vector_score
            FROM {table} t
            JOIN {emb_table} e ON e.search_index_id = t.id
            WHERE {where_sql}
            ORDER BY e.embedding::{cast} <=> '{vec_str}'::{cast}
            LIMIT :top_k
        """
        )

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
            fuzzy_results,
            vector_results,
            fuzzy_weight,
            vector_weight,
            provider.get_id_column(),
            top_k,
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
            str(r[id_key]): rank for rank, r in enumerate(list_a, start=1)
        }
        ranks_b = {
            str(r[id_key]): rank for rank, r in enumerate(list_b, start=1)
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
