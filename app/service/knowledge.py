"""Knowledge Base service — tree CRUD, dataset row CRUD, vectorization, search."""

import json
from math import ceil
from typing import Any, Optional
from uuid import UUID

from loguru import logger
from sqlalchemy import select, func, delete, cast, Float, and_, or_
from sqlalchemy.orm import Session

from app.db.model.knowledge_node import KnowledgeNode
from app.db.model.dataset_row import DatasetRow
from app.db.model.knowledge_embedding import KnowledgeEmbedding
from app.schema.knowledge import (
    NodeCreate,
    NodeUpdate,
    NodeMove,
    NodeTreeItem,
    RowCreate,
    RowUpdate,
    ColumnAdd,
    ColumnUpdate,
    FilterCondition,
    SortSpec,
    SchemaDefinition,
    SearchHit,
)
from app.service.embedding import get_active_embedding_service


# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------

DEFAULT_CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100


def extract_text_from_tiptap_json(content: str) -> str:
    """Extract plain text from TipTap/Novel JSON content for vectorization."""
    if not content or not content.strip():
        return ""
    text = content.strip()
    if not text.startswith("{"):
        return text  # Legacy Markdown or plain text
    try:
        doc = json.loads(content)
        if not isinstance(doc, dict) or doc.get("type") != "doc":
            return text
        texts: list[str] = []

        def walk(nodes: list) -> None:
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                if node.get("type") == "text":
                    t = node.get("text")
                    if isinstance(t, str):
                        texts.append(t)
                if "content" in node and isinstance(node["content"], list):
                    walk(node["content"])

        walk(doc.get("content") or [])
        return "\n".join(texts) if texts else text
    except (json.JSONDecodeError, TypeError):
        return text


def chunk_text(text: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    if not text or len(text.strip()) < 2:
        return []
    text = text.strip()
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP if end < len(text) else len(text)
    return chunks


def serialize_row_data(data: dict) -> str:
    """Serialize structured row data to natural language for embedding."""
    if not data:
        return ""
    parts = [f"{k}: {v}" for k, v in data.items() if v is not None]
    return " | ".join(parts)


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def validate_row_data(data: dict, schema_definition: Optional[dict]) -> None:
    """Validate row data against dataset schema. Raises ValueError on invalid."""
    if not schema_definition or not schema_definition.get("fields"):
        return
    fields = {f["name"]: f for f in schema_definition["fields"]}
    for name, fd in fields.items():
        value = data.get(name)
        if fd.get("required") and (value is None or value == ""):
            raise ValueError(f"Column '{name}' is required")
        if value is None:
            continue
        ftype = fd.get("type", "text")
        if ftype == "number" and not isinstance(value, (int, float)):
            raise ValueError(f"Column '{name}' must be a number")
        if ftype == "boolean" and not isinstance(value, bool):
            raise ValueError(f"Column '{name}' must be a boolean")
        if ftype == "select" and fd.get("options") and value not in fd["options"]:
            raise ValueError(f"Column '{name}' must be one of: {fd['options']}")
        if ftype == "multi_select":
            if not isinstance(value, list):
                raise ValueError(f"Column '{name}' must be a list")
            opts = set(fd.get("options") or [])
            for v in value:
                if v not in opts:
                    raise ValueError(f"Column '{name}' values must be in: {opts}")


# ===========================================================================
# KnowledgeService
# ===========================================================================


class KnowledgeService:
    """Knowledge base business logic."""

    # ------------------------------------------------------------------
    # Internal query helpers
    # ------------------------------------------------------------------

    def _node_q(self, user_id: UUID, include_deleted: bool = False):
        q = select(KnowledgeNode).where(KnowledgeNode.user_id == user_id)
        if not include_deleted:
            q = q.where(KnowledgeNode.is_deleted == False)  # noqa: E712
        return q

    # ------------------------------------------------------------------
    # Tree
    # ------------------------------------------------------------------

    def get_tree(self, db: Session, user_id: UUID) -> list[NodeTreeItem]:
        """Return the full node tree for a user."""
        nodes = list(
            db.scalars(
                self._node_q(user_id).order_by(
                    KnowledgeNode.position, KnowledgeNode.name
                )
            ).all()
        )
        node_map: dict[UUID, NodeTreeItem] = {}
        root_items: list[NodeTreeItem] = []

        for n in nodes:
            item = NodeTreeItem(
                id=n.id,
                parent_id=n.parent_id,
                name=n.name,
                node_type=n.node_type,
                vector_enabled=n.vector_enabled,
                icon=n.icon,
                position=n.position,
                has_content=bool(n.content) if n.node_type == "document" else False,
                schema_definition=n.schema_definition,
                created_at=n.created_at,
                updated_at=n.updated_at,
                children=[],
            )
            node_map[n.id] = item

        for n in nodes:
            item = node_map[n.id]
            if n.parent_id and n.parent_id in node_map:
                node_map[n.parent_id].children.append(item)
            else:
                root_items.append(item)

        return root_items

    # ------------------------------------------------------------------
    # Node CRUD
    # ------------------------------------------------------------------

    def get_node(
        self, db: Session, node_id: UUID, user_id: UUID
    ) -> Optional[KnowledgeNode]:
        q = self._node_q(user_id).where(KnowledgeNode.id == node_id)
        return db.scalar(q)

    def create_node(
        self, db: Session, user_id: UUID, data: NodeCreate
    ) -> KnowledgeNode:
        """Create a node. Validates parent ownership and type constraints."""
        if data.parent_id:
            parent = self.get_node(db, data.parent_id, user_id)
            if not parent:
                raise ValueError("Parent node not found")
            if parent.node_type != "folder":
                raise ValueError("Parent must be a folder")

        schema_def = None
        if data.node_type == "dataset":
            if data.schema_definition:
                schema_def = data.schema_definition.model_dump()
            else:
                schema_def = {"fields": []}

        position = data.position
        if position is None:
            max_pos = db.scalar(
                select(func.coalesce(func.max(KnowledgeNode.position), -1)).where(
                    KnowledgeNode.user_id == user_id,
                    KnowledgeNode.parent_id == data.parent_id
                    if data.parent_id
                    else KnowledgeNode.parent_id.is_(None),
                    KnowledgeNode.is_deleted == False,  # noqa: E712
                )
            )
            position = (max_pos or 0) + 1

        node = KnowledgeNode(
            user_id=user_id,
            parent_id=data.parent_id,
            name=data.name,
            node_type=data.node_type,
            content=data.content if data.node_type == "document" else None,
            schema_definition=schema_def,
            description=data.description,
            icon=data.icon,
            position=position,
        )
        db.add(node)
        db.commit()
        db.refresh(node)
        return node

    def update_node(
        self, db: Session, node_id: UUID, user_id: UUID, data: NodeUpdate
    ) -> Optional[KnowledgeNode]:
        node = self.get_node(db, node_id, user_id)
        if not node:
            return None
        if data.name is not None:
            node.name = data.name
        if data.description is not None:
            node.description = data.description
        if data.icon is not None:
            node.icon = data.icon
        if data.content is not None and node.node_type == "document":
            node.content = data.content
            if self._is_vectorized(db, node):
                self._re_embed_document(db, node)
        if data.schema_definition is not None and node.node_type == "dataset":
            node.schema_definition = data.schema_definition.model_dump()
        if data.vector_enabled is not None and node.node_type == "folder":
            node.vector_enabled = data.vector_enabled
        db.commit()
        db.refresh(node)
        return node

    def delete_node(
        self, db: Session, node_id: UUID, user_id: UUID
    ) -> bool:
        node = self.get_node(db, node_id, user_id)
        if not node:
            return False
        self._soft_delete_recursive(db, node)
        db.commit()
        return True

    def _soft_delete_recursive(self, db: Session, node: KnowledgeNode):
        """Recursively soft-delete a node and all descendants."""
        node.is_deleted = True
        children = list(
            db.scalars(
                select(KnowledgeNode).where(
                    KnowledgeNode.parent_id == node.id,
                    KnowledgeNode.is_deleted == False,  # noqa: E712
                )
            ).all()
        )
        for child in children:
            self._soft_delete_recursive(db, child)

    def move_node(
        self, db: Session, node_id: UUID, user_id: UUID, data: NodeMove
    ) -> Optional[KnowledgeNode]:
        node = self.get_node(db, node_id, user_id)
        if not node:
            return None
        if data.parent_id is not None:
            if data.parent_id == node_id:
                raise ValueError("Cannot move node into itself")
            if data.parent_id != UUID(int=0):
                parent = self.get_node(db, data.parent_id, user_id)
                if not parent:
                    raise ValueError("Target parent not found")
                if parent.node_type != "folder":
                    raise ValueError("Target parent must be a folder")
                if self._is_descendant(db, data.parent_id, node_id):
                    raise ValueError("Cannot move node into its descendant")
                node.parent_id = data.parent_id
            else:
                node.parent_id = None
        if data.position is not None:
            node.position = data.position
        db.commit()
        db.refresh(node)
        return node

    def _is_descendant(
        self, db: Session, candidate_id: UUID, ancestor_id: UUID
    ) -> bool:
        """Check if candidate_id is a descendant of ancestor_id."""
        current = db.get(KnowledgeNode, candidate_id)
        visited = set()
        while current and current.parent_id:
            if current.parent_id in visited:
                break
            visited.add(current.parent_id)
            if current.parent_id == ancestor_id:
                return True
            current = db.get(KnowledgeNode, current.parent_id)
        return False

    # ------------------------------------------------------------------
    # Vector-enabled helpers
    # ------------------------------------------------------------------

    def _is_vectorized(self, db: Session, node: KnowledgeNode) -> bool:
        """Check if a node lives under a folder with vector_enabled=True."""
        current_id = node.parent_id
        visited = set()
        while current_id and current_id not in visited:
            visited.add(current_id)
            parent = db.get(KnowledgeNode, current_id)
            if not parent:
                break
            if parent.node_type == "folder" and parent.vector_enabled:
                return True
            current_id = parent.parent_id
        return False

    def _get_vectorized_folder(
        self, db: Session, node: KnowledgeNode
    ) -> Optional[KnowledgeNode]:
        """Find the nearest ancestor folder with vector_enabled=True."""
        current_id = node.parent_id if node.node_type != "folder" else node.id
        visited = set()
        while current_id and current_id not in visited:
            visited.add(current_id)
            parent = db.get(KnowledgeNode, current_id)
            if not parent:
                break
            if parent.node_type == "folder" and parent.vector_enabled:
                return parent
            current_id = parent.parent_id
        return None

    # ------------------------------------------------------------------
    # Dataset Row CRUD
    # ------------------------------------------------------------------

    def list_rows(
        self,
        db: Session,
        dataset_id: UUID,
        user_id: UUID,
        page: int = 1,
        size: int = 50,
        filters: Optional[list[FilterCondition]] = None,
        sort: Optional[SortSpec] = None,
    ) -> tuple[list[DatasetRow], int]:
        dataset = self.get_node(db, dataset_id, user_id)
        if not dataset or dataset.node_type != "dataset":
            return [], 0

        q = (
            select(DatasetRow)
            .where(DatasetRow.dataset_id == dataset_id, DatasetRow.is_deleted == False)  # noqa: E712
        )
        q = self._apply_row_filters(q, filters, sort)

        total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
        q = q.offset((page - 1) * size).limit(size)
        rows = list(db.scalars(q).all())
        return rows, total

    def _apply_row_filters(self, q, filters, sort):
        if filters:
            for fc in filters:
                cond = self._build_filter_cond(fc)
                if cond is not None:
                    q = q.where(cond)
        if sort and sort.field:
            if sort.field in ("position", "created_at", "updated_at"):
                col = getattr(DatasetRow, sort.field, DatasetRow.position)
                q = q.order_by(col.asc() if sort.order == "asc" else col.desc())
            else:
                jcol = DatasetRow.data[sort.field]
                q = q.order_by(jcol.asc() if sort.order == "asc" else jcol.desc())
        else:
            q = q.order_by(DatasetRow.position.asc(), DatasetRow.created_at.asc())
        return q

    def _build_filter_cond(self, fc: FilterCondition):
        col = DatasetRow.data[fc.field]
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

    def create_row(
        self, db: Session, dataset_id: UUID, user_id: UUID, data: RowCreate
    ) -> Optional[DatasetRow]:
        dataset = self.get_node(db, dataset_id, user_id)
        if not dataset or dataset.node_type != "dataset":
            return None
        validate_row_data(data.data, dataset.schema_definition)

        position = data.position
        if position is None:
            max_pos = db.scalar(
                select(func.coalesce(func.max(DatasetRow.position), -1)).where(
                    DatasetRow.dataset_id == dataset_id,
                    DatasetRow.is_deleted == False,  # noqa: E712
                )
            )
            position = (max_pos or 0) + 1

        row = DatasetRow(
            dataset_id=dataset_id,
            data=data.data,
            position=position,
        )
        db.add(row)
        db.flush()

        if self._is_vectorized(db, dataset):
            self._embed_row(db, row, dataset)

        db.commit()
        db.refresh(row)
        return row

    def update_row(
        self, db: Session, row_id: UUID, user_id: UUID, data: RowUpdate
    ) -> Optional[DatasetRow]:
        row = db.get(DatasetRow, row_id)
        if not row or row.is_deleted:
            return None
        dataset = self.get_node(db, row.dataset_id, user_id)
        if not dataset:
            return None

        if data.data is not None:
            validate_row_data(data.data, dataset.schema_definition)
            row.data = data.data
        if data.position is not None:
            row.position = data.position

        if data.data is not None and self._is_vectorized(db, dataset):
            db.execute(
                delete(KnowledgeEmbedding).where(KnowledgeEmbedding.row_id == row.id)
            )
            db.flush()
            self._embed_row(db, row, dataset)

        db.commit()
        db.refresh(row)
        return row

    def delete_row(
        self, db: Session, row_id: UUID, user_id: UUID
    ) -> bool:
        row = db.get(DatasetRow, row_id)
        if not row or row.is_deleted:
            return False
        dataset = self.get_node(db, row.dataset_id, user_id)
        if not dataset:
            return False
        row.is_deleted = True
        db.commit()
        return True

    # ------------------------------------------------------------------
    # Dataset Schema Mutations
    # ------------------------------------------------------------------

    def add_column(
        self, db: Session, dataset_id: UUID, user_id: UUID, col: ColumnAdd
    ) -> Optional[KnowledgeNode]:
        dataset = self.get_node(db, dataset_id, user_id)
        if not dataset or dataset.node_type != "dataset":
            return None
        schema = dict(dataset.schema_definition or {"fields": []})
        fields = list(schema.get("fields", []))
        if any(f["name"] == col.field.name for f in fields):
            raise ValueError(f"Column '{col.field.name}' already exists")
        fields.append(col.field.model_dump(exclude_none=True))
        schema["fields"] = fields
        dataset.schema_definition = schema
        db.commit()
        db.refresh(dataset)
        return dataset

    def update_column(
        self,
        db: Session,
        dataset_id: UUID,
        user_id: UUID,
        col_name: str,
        updates: ColumnUpdate,
    ) -> Optional[KnowledgeNode]:
        dataset = self.get_node(db, dataset_id, user_id)
        if not dataset or dataset.node_type != "dataset":
            return None
        schema = dict(dataset.schema_definition or {"fields": []})
        fields = list(schema.get("fields", []))
        for i, f in enumerate(fields):
            if f["name"] == col_name:
                if updates.name is not None:
                    fields[i]["name"] = updates.name
                if updates.type is not None:
                    fields[i]["type"] = updates.type
                if updates.required is not None:
                    fields[i]["required"] = updates.required
                if updates.description is not None:
                    fields[i]["description"] = updates.description
                if updates.options is not None:
                    fields[i]["options"] = updates.options
                if updates.width is not None:
                    fields[i]["width"] = updates.width
                break
        else:
            raise ValueError(f"Column '{col_name}' not found")
        schema["fields"] = fields
        dataset.schema_definition = schema
        db.commit()
        db.refresh(dataset)
        return dataset

    def delete_column(
        self, db: Session, dataset_id: UUID, user_id: UUID, col_name: str
    ) -> Optional[KnowledgeNode]:
        dataset = self.get_node(db, dataset_id, user_id)
        if not dataset or dataset.node_type != "dataset":
            return None
        schema = dict(dataset.schema_definition or {"fields": []})
        fields = [f for f in schema.get("fields", []) if f["name"] != col_name]
        schema["fields"] = fields
        dataset.schema_definition = schema
        db.commit()
        db.refresh(dataset)
        return dataset

    # ------------------------------------------------------------------
    # Embedding
    # ------------------------------------------------------------------

    def _embed_document(self, db: Session, node: KnowledgeNode) -> None:
        """Generate and store embeddings for a document node."""
        if node.node_type != "document" or not node.content:
            return
        plain_text = extract_text_from_tiptap_json(node.content)
        texts = chunk_text(plain_text)
        if not texts:
            return
        self._store_embeddings(db, texts, node_id=node.id)

    def _re_embed_document(self, db: Session, node: KnowledgeNode) -> None:
        db.execute(
            delete(KnowledgeEmbedding).where(KnowledgeEmbedding.node_id == node.id)
        )
        db.flush()
        self._embed_document(db, node)

    def _embed_row(
        self, db: Session, row: DatasetRow, dataset: KnowledgeNode
    ) -> None:
        text = serialize_row_data(row.data)
        if not text:
            return
        self._store_embeddings(db, [text], row_id=row.id)

    def _store_embeddings(
        self,
        db: Session,
        texts: list[str],
        node_id: Optional[UUID] = None,
        row_id: Optional[UUID] = None,
    ) -> None:
        try:
            embedding_svc, model_config = get_active_embedding_service(db, "document")
        except Exception as e:
            logger.error(f"Failed to get embedding service: {e}")
            return
        try:
            embeddings = embedding_svc.generate_embeddings_batch(texts)
            for i, (text, emb) in enumerate(zip(texts, embeddings)):
                if emb:
                    rec = KnowledgeEmbedding(
                        node_id=node_id,
                        row_id=row_id,
                        model_id=model_config.model_id,
                        embedding=emb,
                        chunk_index=i,
                        chunk_text=text,
                        status="completed",
                    )
                    db.add(rec)
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")

    # ------------------------------------------------------------------
    # Vectorize folder
    # ------------------------------------------------------------------

    def vectorize_folder(
        self, db: Session, folder_id: UUID, user_id: UUID
    ) -> dict:
        """Vectorize all content under a folder. Called as background task."""
        folder = self.get_node(db, folder_id, user_id)
        if not folder or folder.node_type != "folder":
            return {"status": "error", "error": "Folder not found"}
        if not folder.vector_enabled:
            return {"status": "error", "error": "Vectorization not enabled"}

        descendant_ids = self._collect_descendant_ids(db, folder_id)
        documents = list(
            db.scalars(
                select(KnowledgeNode).where(
                    KnowledgeNode.id.in_(descendant_ids),
                    KnowledgeNode.node_type == "document",
                    KnowledgeNode.is_deleted == False,  # noqa: E712
                )
            ).all()
        )
        datasets = list(
            db.scalars(
                select(KnowledgeNode).where(
                    KnowledgeNode.id.in_(descendant_ids),
                    KnowledgeNode.node_type == "dataset",
                    KnowledgeNode.is_deleted == False,  # noqa: E712
                )
            ).all()
        )

        total = 0
        processed = 0
        failed = 0

        # Clean existing embeddings for these nodes
        if descendant_ids:
            db.execute(
                delete(KnowledgeEmbedding).where(
                    KnowledgeEmbedding.node_id.in_(descendant_ids)
                )
            )
            row_ids = list(
                db.scalars(
                    select(DatasetRow.id).where(
                        DatasetRow.dataset_id.in_(descendant_ids),
                        DatasetRow.is_deleted == False,  # noqa: E712
                    )
                ).all()
            )
            if row_ids:
                db.execute(
                    delete(KnowledgeEmbedding).where(
                        KnowledgeEmbedding.row_id.in_(row_ids)
                    )
                )
            db.commit()

        # Embed documents
        for doc in documents:
            total += 1
            try:
                self._embed_document(db, doc)
                processed += 1
            except Exception as e:
                logger.error(f"Vectorize failed for document {doc.id}: {e}")
                failed += 1
            db.commit()

        # Embed dataset rows
        for ds in datasets:
            rows = list(
                db.scalars(
                    select(DatasetRow).where(
                        DatasetRow.dataset_id == ds.id,
                        DatasetRow.is_deleted == False,  # noqa: E712
                    )
                ).all()
            )
            for row in rows:
                total += 1
                try:
                    self._embed_row(db, row, ds)
                    processed += 1
                except Exception as e:
                    logger.error(f"Vectorize failed for row {row.id}: {e}")
                    failed += 1
                db.commit()

        return {
            "status": "completed",
            "total": total,
            "processed": processed,
            "failed": failed,
        }

    def _collect_descendant_ids(self, db: Session, folder_id: UUID) -> list[UUID]:
        """Collect all descendant node IDs (including the folder itself)."""
        result = [folder_id]
        children = list(
            db.scalars(
                select(KnowledgeNode.id).where(
                    KnowledgeNode.parent_id == folder_id,
                    KnowledgeNode.is_deleted == False,  # noqa: E712
                )
            ).all()
        )
        for child_id in children:
            result.extend(self._collect_descendant_ids(db, child_id))
        return result

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        db: Session,
        user_id: UUID,
        folder_ids: Optional[list[UUID]] = None,
        query: Optional[str] = None,
        filters: Optional[list[FilterCondition]] = None,
        top_k: int = 10,
        min_score: Optional[float] = None,
        page: int = 1,
        size: int = 20,
    ) -> tuple[list[SearchHit], int]:
        """Hybrid search across vectorized knowledge content."""
        if not query:
            return [], 0

        try:
            embedding_svc, model_config = get_active_embedding_service(db, "document")
        except Exception:
            return [], 0

        qvec = embedding_svc.generate_query_embedding(query)
        if not qvec:
            return [], 0

        # Determine which folders to search
        if folder_ids:
            all_node_ids: list[UUID] = []
            for fid in folder_ids:
                all_node_ids.extend(self._collect_descendant_ids(db, fid))
        else:
            all_node_ids = list(
                db.scalars(
                    select(KnowledgeNode.id).where(
                        KnowledgeNode.user_id == user_id,
                        KnowledgeNode.is_deleted == False,  # noqa: E712
                    )
                ).all()
            )

        if not all_node_ids:
            return [], 0

        # Get row IDs under these nodes
        row_ids_in_scope = list(
            db.scalars(
                select(DatasetRow.id).where(
                    DatasetRow.dataset_id.in_(all_node_ids),
                    DatasetRow.is_deleted == False,  # noqa: E712
                )
            ).all()
        )

        vec_str = "[" + ",".join(map(str, qvec)) + "]"
        cast_expr = model_config.index_cast

        from sqlalchemy import text as sa_text

        # Build scope conditions
        scope_parts = []
        params: dict[str, Any] = {
            "vec": vec_str,
            "model_id": model_config.model_id,
            "limit": top_k,
        }
        for i, nid in enumerate(all_node_ids):
            params[f"n{i}"] = nid
        node_placeholders = ", ".join(f":n{i}" for i in range(len(all_node_ids)))

        if node_placeholders:
            scope_parts.append(f"e.node_id IN ({node_placeholders})")
        if row_ids_in_scope:
            for i, rid in enumerate(row_ids_in_scope):
                params[f"r{i}"] = rid
            row_placeholders = ", ".join(f":r{i}" for i in range(len(row_ids_in_scope)))
            scope_parts.append(f"e.row_id IN ({row_placeholders})")

        scope_sql = " OR ".join(scope_parts) if scope_parts else "FALSE"

        sql = sa_text(f"""
            SELECT e.node_id, e.row_id, e.chunk_text,
                   (1 - (e.embedding::{cast_expr} <=> :vec::{cast_expr})) AS score
            FROM knowledge_embedding e
            WHERE ({scope_sql})
              AND e.model_id = :model_id
              AND e.status = 'completed'
            ORDER BY e.embedding::{cast_expr} <=> :vec::{cast_expr}
            LIMIT :limit
        """)
        raw_rows = db.execute(sql, params).fetchall()

        if min_score is not None:
            raw_rows = [r for r in raw_rows if r.score >= min_score]

        total = len(raw_rows)
        offset = (page - 1) * size
        raw_rows = raw_rows[offset: offset + size]

        hits: list[SearchHit] = []
        for r in raw_rows:
            node_name = ""
            node_type = ""
            if r.node_id:
                n = db.get(KnowledgeNode, r.node_id)
                if n:
                    node_name = n.name
                    node_type = n.node_type
            elif r.row_id:
                row_obj = db.get(DatasetRow, r.row_id)
                if row_obj:
                    ds = db.get(KnowledgeNode, row_obj.dataset_id)
                    if ds:
                        node_name = ds.name
                        node_type = "dataset_row"
            hits.append(
                SearchHit(
                    node_id=r.node_id,
                    row_id=r.row_id,
                    node_name=node_name,
                    node_type=node_type,
                    content_preview=r.chunk_text[:200] if r.chunk_text else "",
                    score=r.score,
                )
            )

        return hits, total
