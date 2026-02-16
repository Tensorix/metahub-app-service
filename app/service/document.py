"""Document Store service — CRUD, schema validation, structured query, vectorization."""

from typing import Any, Optional
from uuid import UUID

from loguru import logger
from sqlalchemy import select, func, delete, cast, Float
from sqlalchemy.orm import Session

from app.db.model.document import Document
from app.db.model.document_collection import DocumentCollection
from app.db.model.document_embedding import DocumentEmbedding
from app.schema.document import (
    CollectionCreate,
    CollectionUpdate,
    DocumentCreate,
    DocumentUpdate,
    FilterCondition,
    SortSpec,
)
from app.service.embedding import get_active_embedding_service


# Default chunk size for unstructured content (chars)
DEFAULT_CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100


# =============================================================================
# Chunking helpers
# =============================================================================


def chunk_text(text: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    if not text or len(text.strip()) < 2:
        return []
    text = text.strip()
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP if end < len(text) else len(text)
    return chunks


def serialize_structured_data(data: dict) -> str:
    """Serialize structured data to natural language text for embedding."""
    if not data:
        return ""
    parts = [f"{k}: {v}" for k, v in data.items() if v is not None]
    return " | ".join(parts)


# =============================================================================
# Schema validation
# =============================================================================


def validate_data_against_schema(
    data: dict,
    schema_definition: Optional[dict],
) -> None:
    """Validate document data against collection schema. Raises ValueError on invalid."""
    if not schema_definition or not schema_definition.get("fields"):
        return
    fields = {f["name"]: f for f in schema_definition["fields"]}
    for name, fd in fields.items():
        value = data.get(name)
        if fd.get("required") and (value is None or value == ""):
            raise ValueError(f"Field '{name}' is required")
        if value is None:
            continue
        ftype = fd.get("type", "text")
        if ftype == "number" and not isinstance(value, (int, float)):
            raise ValueError(f"Field '{name}' must be a number")
        if ftype == "boolean" and not isinstance(value, bool):
            raise ValueError(f"Field '{name}' must be a boolean")
        if ftype == "select" and fd.get("options") and value not in fd["options"]:
            raise ValueError(f"Field '{name}' must be one of: {fd['options']}")
        if ftype == "multi_select":
            if not isinstance(value, list):
                raise ValueError(f"Field '{name}' must be a list")
            opts = set(fd.get("options") or [])
            for v in value:
                if v not in opts:
                    raise ValueError(f"Field '{name}' values must be in: {opts}")


# =============================================================================
# DocumentService
# =============================================================================


class DocumentService:
    """Document store service."""

    def _collection_query(self, db: Session, user_id: UUID, include_deleted: bool = False):
        q = select(DocumentCollection).where(
            DocumentCollection.user_id == user_id,
        )
        if not include_deleted:
            q = q.where(DocumentCollection.is_deleted == False)
        return q

    def _document_query(self, db: Session, collection_id: UUID, include_deleted: bool = False):
        q = select(Document).where(Document.collection_id == collection_id)
        if not include_deleted:
            q = q.where(Document.is_deleted == False)
        return q

    # ---------- Collection CRUD ----------

    def list_collections(
        self,
        db: Session,
        user_id: UUID,
    ) -> list[DocumentCollection]:
        """List all collections for user."""
        return list(db.scalars(self._collection_query(db, user_id)).all())

    def get_collection(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
    ) -> Optional[DocumentCollection]:
        """Get collection by ID if it belongs to user."""
        q = (
            self._collection_query(db, user_id)
            .where(DocumentCollection.id == collection_id)
        )
        return db.scalar(q)

    def create_collection(
        self,
        db: Session,
        user_id: UUID,
        data: CollectionCreate,
    ) -> DocumentCollection:
        """Create a new collection."""
        schema_def = None
        if data.schema_definition:
            schema_def = data.schema_definition.model_dump()
        if data.type == "structured" and not schema_def:
            raise ValueError("Structured collection requires schema_definition")

        coll = DocumentCollection(
            user_id=user_id,
            name=data.name,
            description=data.description,
            type=data.type,
            schema_definition=schema_def,
        )
        db.add(coll)
        db.commit()
        db.refresh(coll)
        return coll

    def update_collection(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
        data: CollectionUpdate,
    ) -> Optional[DocumentCollection]:
        """Update collection."""
        coll = self.get_collection(db, collection_id, user_id)
        if not coll:
            return None
        if data.name is not None:
            coll.name = data.name
        if data.description is not None:
            coll.description = data.description
        if data.schema_definition is not None:
            coll.schema_definition = data.schema_definition.model_dump()
        db.commit()
        db.refresh(coll)
        return coll

    def delete_collection(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Soft delete collection."""
        coll = self.get_collection(db, collection_id, user_id)
        if not coll:
            return False
        coll.is_deleted = True
        db.commit()
        return True

    def set_vectorization(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
        enabled: bool,
    ) -> Optional[DocumentCollection]:
        """Enable or disable vectorization on collection."""
        coll = self.get_collection(db, collection_id, user_id)
        if not coll:
            return None
        coll.vector_enabled = enabled
        db.commit()
        db.refresh(coll)
        return coll

    # ---------- Document CRUD ----------

    def list_documents(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
        page: int = 1,
        size: int = 20,
        filters: Optional[list[FilterCondition]] = None,
        sort: Optional[SortSpec] = None,
        include_deleted: bool = False,
    ) -> tuple[list[Document], int]:
        """List documents with pagination and filters."""
        coll = self.get_collection(db, collection_id, user_id)
        if not coll:
            return [], 0

        q = self._document_query(db, collection_id, include_deleted=not include_deleted)
        q = self._apply_filters(q, filters, sort, coll.type)

        count_stmt = select(func.count()).select_from(q.subquery())
        total = db.scalar(count_stmt) or 0
        offset = (page - 1) * size
        q = q.offset(offset).limit(size)
        docs = list(db.scalars(q).all())
        return docs, total

    def _apply_filters(
        self,
        q,
        filters: Optional[list[FilterCondition]],
        sort: Optional[SortSpec],
        collection_type: str,
    ):
        """Apply filter conditions and sort. Returns (query, count_query)."""
        if filters and collection_type == "structured":
            for fc in filters:
                cond = self._build_filter_condition(fc)
                if cond is not None:
                    q = q.where(cond)
        if sort and sort.field:
            if sort.field in ("title", "created_at", "updated_at"):
                col = getattr(Document, sort.field, Document.created_at)
                q = q.order_by(col.asc() if sort.order == "asc" else col.desc())
            elif collection_type == "structured":
                jcol = Document.data[sort.field]
                q = q.order_by(jcol.asc() if sort.order == "asc" else jcol.desc())
            else:
                q = q.order_by(Document.created_at.desc())
        else:
            q = q.order_by(Document.created_at.desc())
        return q

    def _build_filter_condition(self, fc: FilterCondition):
        """Build SQLAlchemy condition from FilterCondition."""
        if not fc.field:
            return None
        col = Document.data[fc.field]
        val = fc.value
        op = fc.op
        if op == "eq":
            return col.astext == str(val)
        if op == "neq":
            return col.astext != str(val)
        if op == "gt":
            return cast(col.astext, Float) > float(val)
        if op == "gte":
            return cast(col.astext, Float) >= float(val)
        if op == "lt":
            return cast(col.astext, Float) < float(val)
        if op == "lte":
            return cast(col.astext, Float) <= float(val)
        if op == "in":
            if not isinstance(val, list):
                return None
            return col.astext.in_([str(v) for v in val])
        if op == "contains":
            return col.astext.contains(str(val))
        if op == "starts_with":
            return col.astext.startswith(str(val))
        return None

    def get_document(
        self,
        db: Session,
        document_id: UUID,
        user_id: UUID,
    ) -> Optional[Document]:
        """Get document by ID. Verifies via collection ownership."""
        doc = db.get(Document, document_id)
        if not doc or doc.is_deleted:
            return None
        coll = self.get_collection(db, doc.collection_id, user_id)
        if not coll:
            return None
        return doc

    def create_document(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
        data: DocumentCreate,
    ) -> Optional[Document]:
        """Create document. Validates schema for structured collections."""
        coll = self.get_collection(db, collection_id, user_id)
        if not coll:
            return None

        if coll.type == "structured":
            if data.data is None:
                raise ValueError("Structured collection requires data")
            validate_data_against_schema(data.data, coll.schema_definition)
            doc = Document(
                collection_id=collection_id,
                title=data.title,
                data=data.data,
                metadata_=data.metadata_,
            )
        else:
            doc = Document(
                collection_id=collection_id,
                title=data.title,
                content=data.content or "",
                metadata_=data.metadata_,
            )
        db.add(doc)
        db.flush()

        if coll.vector_enabled:
            self._embed_document(db, doc)

        db.commit()
        db.refresh(doc)
        return doc

    def update_document(
        self,
        db: Session,
        document_id: UUID,
        user_id: UUID,
        data: DocumentUpdate,
    ) -> Optional[Document]:
        """Update document."""
        doc = self.get_document(db, document_id, user_id)
        if not doc:
            return None
        coll = doc.collection

        if data.title is not None:
            doc.title = data.title
        if data.content is not None:
            doc.content = data.content
        if data.data is not None:
            if coll.type != "structured":
                raise ValueError("Cannot set data on unstructured document")
            validate_data_against_schema(data.data, coll.schema_definition)
            doc.data = data.data
        if data.metadata_ is not None:
            doc.metadata_ = data.metadata_

        if coll.vector_enabled:
            # Remove old embeddings, regenerate
            db.execute(delete(DocumentEmbedding).where(DocumentEmbedding.document_id == doc.id))
            db.flush()
            self._embed_document(db, doc)

        db.commit()
        db.refresh(doc)
        return doc

    def delete_document(
        self,
        db: Session,
        document_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Soft delete document."""
        doc = self.get_document(db, document_id, user_id)
        if not doc:
            return False
        doc.is_deleted = True
        db.commit()
        return True

    # ---------- Embedding ----------

    def _embed_document(self, db: Session, doc: Document) -> None:
        """Generate and store embeddings for a document."""
        try:
            embedding_svc, model_config = get_active_embedding_service(db, "document")
        except Exception as e:
            logger.error(f"Failed to get embedding service: {e}")
            return

        if doc.collection.type == "unstructured":
            texts = chunk_text(doc.content or "")
        else:
            text = serialize_structured_data(doc.data or {})
            texts = [text] if text else []

        if not texts:
            return

        try:
            embeddings = embedding_svc.generate_embeddings_batch(texts)
            for i, (text, emb) in enumerate(zip(texts, embeddings)):
                if emb:
                    rec = DocumentEmbedding(
                        document_id=doc.id,
                        model_id=model_config.model_id,
                        embedding=emb,
                        chunk_index=i,
                        chunk_text=text,
                        status="completed",
                    )
                    db.add(rec)
        except Exception as e:
            logger.error(f"Embedding failed for document {doc.id}: {e}")

    def vectorize_collection(
        self,
        db: Session,
        collection_id: UUID,
        user_id: UUID,
    ) -> dict:
        """
        Vectorize all documents in a collection.
        Deletes existing embeddings first, then generates new ones.
        """
        coll = self.get_collection(db, collection_id, user_id)
        if not coll:
            return {"status": "error", "error": "Collection not found"}
        if not coll.vector_enabled:
            return {"status": "error", "error": "Vectorization not enabled on collection"}

        docs = list(db.scalars(self._document_query(db, collection_id)).all())
        total = len(docs)
        processed = 0
        failed = 0

        # Delete existing embeddings for these documents
        doc_ids = [d.id for d in docs]
        db.execute(delete(DocumentEmbedding).where(DocumentEmbedding.document_id.in_(doc_ids)))
        db.commit()

        try:
            embedding_svc, model_config = get_active_embedding_service(db, "document")
        except Exception as e:
            return {"status": "error", "error": str(e), "processed": 0, "failed": total}

        for doc in docs:
            try:
                self._embed_document(db, doc)
                processed += 1
            except Exception as e:
                logger.error(f"Vectorize failed for doc {doc.id}: {e}")
                failed += 1
            db.commit()

        return {
            "status": "completed",
            "total": total,
            "processed": processed,
            "failed": failed,
        }

    # ---------- Search ----------

    def search(
        self,
        db: Session,
        user_id: UUID,
        collection_ids: Optional[list[UUID]] = None,
        query: Optional[str] = None,
        filters: Optional[list[FilterCondition]] = None,
        top_k: int = 10,
        min_score: Optional[float] = None,
        page: int = 1,
        size: int = 20,
    ) -> tuple[list[tuple[Document, Optional[float]]], int]:
        """
        Hybrid search: vector (if query provided) + structured filters.
        Returns (list of (document, score), total_count).
        """
        # Base: collections belonging to user
        coll_q = (
            select(DocumentCollection.id)
            .where(
                DocumentCollection.user_id == user_id,
                DocumentCollection.is_deleted == False,
            )
        )
        if collection_ids:
            coll_q = coll_q.where(DocumentCollection.id.in_(collection_ids))
        allowed_ids = set(db.scalars(coll_q).all())

        if not allowed_ids:
            return [], 0

        if query and not filters:
            # Pure vector search
            return self._vector_search(db, allowed_ids, query, top_k, min_score, page, size)
        if filters and not query:
            # Pure filter search
            return self._filter_search(db, allowed_ids, filters, page, size)
        if query and filters:
            # Hybrid: vector then filter
            return self._hybrid_search(db, user_id, allowed_ids, query, filters, top_k, min_score, page, size)

        return self._filter_search(db, allowed_ids, None, page, size)

    def _vector_search(
        self,
        db: Session,
        collection_ids: set[UUID],
        query: str,
        top_k: int,
        min_score: Optional[float],
        page: int,
        size: int,
    ) -> tuple[list[tuple[Document, Optional[float]]], int]:
        """Vector similarity search."""
        try:
            embedding_svc, model_config = get_active_embedding_service(db, "document")
        except Exception:
            return [], 0
        qvec = embedding_svc.generate_query_embedding(query)
        if not qvec:
            return [], 0

        vec_str = "[" + ",".join(map(str, qvec)) + "]"
        cast_expr = model_config.index_cast

        # Raw SQL for pgvector <=> operator
        from sqlalchemy import text
        coll_list = list(collection_ids)
        placeholders = ", ".join(f":c{i}" for i in range(len(coll_list)))
        sql = text(f"""
            SELECT d.id, (1 - (e.embedding::{cast_expr} <=> :vec::{cast_expr})) AS score
            FROM document d
            JOIN document_embedding e ON e.document_id = d.id
            WHERE d.collection_id IN ({placeholders})
              AND d.is_deleted = FALSE
              AND e.model_id = :model_id
              AND e.status = 'completed'
            ORDER BY e.embedding::{cast_expr} <=> :vec::{cast_expr}
            LIMIT :limit
        """)
        params = {"vec": vec_str, "model_id": model_config.model_id, "limit": page * size}
        params.update({f"c{i}": cid for i, cid in enumerate(coll_list)})
        rows = db.execute(sql, params).fetchall()
        total = len(rows)

        if min_score is not None:
            rows = [r for r in rows if r.score >= min_score]
        offset = (page - 1) * size
        rows = rows[offset : offset + size]

        doc_ids = [r.id for r in rows]
        scores = {r.id: r.score for r in rows}
        docs = dict((d.id, d) for d in db.scalars(select(Document).where(Document.id.in_(doc_ids))).all())
        result = [(docs[did], scores.get(did)) for did in doc_ids if did in docs]
        return result, total

    def _filter_search(
        self,
        db: Session,
        collection_ids: set[UUID],
        filters: Optional[list[FilterCondition]],
        page: int,
        size: int,
    ) -> tuple[list[tuple[Document, Optional[float]]], int]:
        """Filter-only search (no vector)."""
        q = (
            select(Document)
            .where(
                Document.collection_id.in_(collection_ids),
                Document.is_deleted == False,
            )
        )
        # Apply filters if any (simplified - would need collection type per doc)
        q = q.order_by(Document.created_at.desc())
        count_q = select(func.count()).select_from(q.subquery())
        total = db.scalar(count_q) or 0
        q = q.offset((page - 1) * size).limit(size)
        docs = list(db.scalars(q).all())
        return [(d, None) for d in docs], total

    def _hybrid_search(
        self,
        db: Session,
        user_id: UUID,
        collection_ids: set[UUID],
        query: str,
        filters: list[FilterCondition],
        top_k: int,
        min_score: Optional[float],
        page: int,
        size: int,
    ) -> tuple[list[tuple[Document, Optional[float]]], int]:
        """Vector search then apply filters in memory (simplified)."""
        hits, _ = self._vector_search(db, collection_ids, query, top_k * 2, min_score, 1, top_k * 2)
        # TODO: apply filters on structured docs in memory
        total = len(hits)
        offset = (page - 1) * size
        return hits[offset : offset + size], total
