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
    VectorizationConfig,
)
from app.service.embedding import (
    get_active_embedding_service,
    get_embedding_service_by_model,
)
from app.service.chunking import chunk_text_with_config


# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------


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


def _default_vectorization_config() -> VectorizationConfig:
    """Return default vectorization config when folder has none."""
    return VectorizationConfig()


def serialize_row_data(data: dict) -> str:
    """Serialize structured row data to natural language for embedding."""
    if not data:
        return ""
    parts = [f"{k}: {v}" for k, v in data.items() if v is not None]
    return " | ".join(parts)


def _escape_ilike_pattern(s: str) -> str:
    """Escape % and _ for use in ILIKE pattern."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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

        content_val = data.content if data.node_type == "document" else None
        content_plain_val = (
            extract_text_from_tiptap_json(content_val)
            if content_val
            else None
        )
        node = KnowledgeNode(
            user_id=user_id,
            parent_id=data.parent_id,
            name=data.name,
            node_type=data.node_type,
            content=content_val,
            content_plain_text=content_plain_val,
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
            node.content_plain_text = extract_text_from_tiptap_json(data.content)
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
            data_plain_text=serialize_row_data(data.data),
            position=position,
        )
        db.add(row)
        db.flush()

        if self._is_vectorized(db, dataset):
            folder = self._get_vectorized_folder(db, dataset)
            if folder:
                self._embed_row(db, row, dataset, folder)

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
            row.data_plain_text = serialize_row_data(data.data)
        if data.position is not None:
            row.position = data.position

        if data.data is not None and self._is_vectorized(db, dataset):
            db.execute(
                delete(KnowledgeEmbedding).where(KnowledgeEmbedding.row_id == row.id)
            )
            db.flush()
            folder = self._get_vectorized_folder(db, dataset)
            if folder:
                self._embed_row(db, row, dataset, folder)

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

    def batch_update_rows(
        self,
        db: Session,
        dataset_id: UUID,
        user_id: UUID,
        updates: list[dict[str, Any]],
    ) -> Optional[list[DatasetRow]]:
        """Batch update row positions and/or data. Returns updated rows or None if dataset not found."""
        dataset = self.get_node(db, dataset_id, user_id)
        if not dataset or dataset.node_type != "dataset":
            return None

        rows_to_refresh: list[DatasetRow] = []
        for item in updates:
            row_id = item.get("id")
            if not row_id:
                raise ValueError("Each update must have an 'id'")
            try:
                rid = UUID(row_id) if isinstance(row_id, str) else row_id
            except (TypeError, ValueError):
                raise ValueError(f"Invalid row id: {row_id}")

            row = db.get(DatasetRow, rid)
            if not row or row.is_deleted or row.dataset_id != dataset_id:
                raise ValueError(f"Row {row_id} not found or does not belong to dataset")

            if "data" in item:
                validate_row_data(item["data"], dataset.schema_definition)
                row.data = item["data"]
                row.data_plain_text = serialize_row_data(item["data"])
                if self._is_vectorized(db, dataset):
                    db.execute(
                        delete(KnowledgeEmbedding).where(KnowledgeEmbedding.row_id == row.id)
                    )
                    db.flush()
                    folder = self._get_vectorized_folder(db, dataset)
                    if folder:
                        self._embed_row(db, row, dataset, folder)
            if "position" in item:
                row.position = int(item["position"])
            rows_to_refresh.append(row)

        db.commit()
        for r in rows_to_refresh:
            db.refresh(r)
        return rows_to_refresh

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

    def _get_folder_config(self, folder: KnowledgeNode) -> VectorizationConfig:
        """Get vectorization config from folder, or defaults."""
        if folder.vectorization_config and isinstance(
            folder.vectorization_config, dict
        ):
            try:
                return VectorizationConfig.model_validate(
                    folder.vectorization_config
                )
            except Exception:
                pass
        return _default_vectorization_config()

    def _embed_document(
        self, db: Session, node: KnowledgeNode, folder: KnowledgeNode
    ) -> None:
        """Generate and store embeddings for a document node."""
        if node.node_type != "document" or not node.content:
            return
        plain_text = extract_text_from_tiptap_json(node.content)
        config = self._get_folder_config(folder)
        chunk_items = chunk_text_with_config(plain_text, config)
        if not chunk_items:
            return
        texts = [c["text"] for c in chunk_items]
        parent_texts = [c.get("parent_text") for c in chunk_items]
        self._store_embeddings(
            db,
            texts,
            node_id=node.id,
            model_id=config.model_id,
            parent_texts=parent_texts,
        )

    def _re_embed_document(self, db: Session, node: KnowledgeNode) -> None:
        folder = self._get_vectorized_folder(db, node)
        if not folder:
            return
        db.execute(
            delete(KnowledgeEmbedding).where(KnowledgeEmbedding.node_id == node.id)
        )
        db.flush()
        self._embed_document(db, node, folder)

    def _embed_row(
        self,
        db: Session,
        row: DatasetRow,
        dataset: KnowledgeNode,
        folder: KnowledgeNode,
    ) -> None:
        text = serialize_row_data(row.data)
        if not text:
            return
        config = self._get_folder_config(folder)
        self._store_embeddings(
            db,
            [text],
            row_id=row.id,
            model_id=config.model_id,
        )

    def _store_embeddings(
        self,
        db: Session,
        texts: list[str],
        node_id: Optional[UUID] = None,
        row_id: Optional[UUID] = None,
        model_id: Optional[str] = None,
        parent_texts: Optional[list[Optional[str]]] = None,
    ) -> None:
        try:
            if model_id:
                embedding_svc, model_config = get_embedding_service_by_model(
                    model_id
                )
            else:
                embedding_svc, model_config = get_active_embedding_service(
                    db, "document"
                )
        except Exception as e:
            logger.error(f"Failed to get embedding service: {e}")
            return
        parent_texts = parent_texts or [None] * len(texts)
        if len(parent_texts) < len(texts):
            parent_texts = parent_texts + [None] * (len(texts) - len(parent_texts))
        try:
            embeddings = embedding_svc.generate_embeddings_batch(texts)
            parent_cache: dict[str, UUID] = {}
            for i, (text, emb) in enumerate(zip(texts, embeddings)):
                if not emb:
                    continue
                parent_id_val: Optional[UUID] = None
                ptext = parent_texts[i] if i < len(parent_texts) else None
                if node_id and ptext and ptext.strip():
                    pkey = ptext[:200]
                    if pkey not in parent_cache:
                        parent_emb = embedding_svc.generate_embedding(ptext)
                        if parent_emb:
                            parent_rec = KnowledgeEmbedding(
                                node_id=node_id,
                                row_id=None,
                                model_id=model_config.model_id,
                                embedding=parent_emb,
                                chunk_index=-1,
                                chunk_text=ptext,
                                status="completed",
                            )
                            db.add(parent_rec)
                            db.flush()
                            parent_cache[pkey] = parent_rec.id
                    parent_id_val = parent_cache.get(pkey)
                rec = KnowledgeEmbedding(
                    node_id=node_id,
                    row_id=row_id,
                    parent_id=parent_id_val,
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
                self._embed_document(db, doc, folder)
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
                    self._embed_row(db, row, ds, folder)
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

    RRF_K = 60

    def search(
        self,
        db: Session,
        user_id: UUID,
        folder_ids: Optional[list[UUID]] = None,
        query: Optional[str] = None,
        filters: Optional[list[FilterCondition]] = None,
        search_mode: str = "fuzzy",
        fuzzy_weight: float = 0.4,
        vector_weight: float = 0.6,
        top_k: int = 10,
        min_score: Optional[float] = None,
        page: int = 1,
        size: int = 20,
    ) -> tuple[list[SearchHit], int]:
        """Search across vectorized knowledge: fuzzy | vector | hybrid."""
        if not query or not query.strip():
            return [], 0

        all_node_ids, row_ids_in_scope = self._search_scope(db, user_id, folder_ids)
        if not all_node_ids and not row_ids_in_scope:
            return [], 0

        scope_sql, params = self._build_search_scope_sql(all_node_ids, row_ids_in_scope)

        if search_mode == "fuzzy":
            raw_results = self._knowledge_fuzzy_search_direct(
                db, query, all_node_ids, row_ids_in_scope, top_k * 3
            )
        elif search_mode == "vector":
            raw_results = self._knowledge_vector_search(
                db, query, scope_sql, params, top_k * 3
            )
        else:
            # hybrid: fuzzy from direct (node/row), vector from embedding
            fuzzy_results = self._knowledge_fuzzy_search_direct(
                db, query, all_node_ids, row_ids_in_scope, top_k * 3
            )
            vector_results = self._knowledge_vector_search(
                db, query, scope_sql, params, top_k * 3
            )
            raw_results = self._rrf_fusion_by_node_row(
                fuzzy_results, vector_results, fuzzy_weight, vector_weight, top_k
            )

        if min_score is not None:
            raw_results = [r for r in raw_results if (r.get("score") or 0) >= min_score]

        total = len(raw_results)
        offset = (page - 1) * size
        raw_results = raw_results[offset: offset + size]

        hits = self._enrich_search_hits(db, raw_results)
        return hits, total

    def _search_scope(
        self, db: Session, user_id: UUID, folder_ids: Optional[list[UUID]]
    ) -> tuple[list[UUID], list[UUID]]:
        """Compute node_ids and row_ids in scope."""
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
        row_ids_in_scope = []
        if all_node_ids:
            row_ids_in_scope = list(
                db.scalars(
                    select(DatasetRow.id).where(
                        DatasetRow.dataset_id.in_(all_node_ids),
                        DatasetRow.is_deleted == False,  # noqa: E712
                    )
                ).all()
            )
        return all_node_ids, row_ids_in_scope

    def _build_search_scope_sql(
        self,
        all_node_ids: list[UUID],
        row_ids_in_scope: list[UUID],
    ) -> tuple[str, dict[str, Any]]:
        scope_parts = []
        params: dict[str, Any] = {}
        if all_node_ids:
            for i, nid in enumerate(all_node_ids):
                params[f"n{i}"] = nid
            node_placeholders = ", ".join(f":n{i}" for i in range(len(all_node_ids)))
            scope_parts.append(f"e.node_id IN ({node_placeholders})")
        if row_ids_in_scope:
            for i, rid in enumerate(row_ids_in_scope):
                params[f"r{i}"] = rid
            row_placeholders = ", ".join(f":r{i}" for i in range(len(row_ids_in_scope)))
            scope_parts.append(f"e.row_id IN ({row_placeholders})")
        scope_sql = " OR ".join(scope_parts) if scope_parts else "FALSE"
        return scope_sql, params

    def _knowledge_fuzzy_search_direct(
        self,
        db: Session,
        query: str,
        all_node_ids: list[UUID],
        row_ids_in_scope: list[UUID],
        limit: int,
    ) -> list[dict]:
        """Fuzzy search on knowledge_node and dataset_row (no embedding required)."""
        from sqlalchemy import text as sa_text

        ilike_pattern = "%" + _escape_ilike_pattern(query) + "%"
        params: dict[str, Any] = {
            "query": query,
            "ilike_pattern": ilike_pattern,
            "threshold": 0.1,
            "limit": limit,
        }
        for i, nid in enumerate(all_node_ids):
            params[f"n{i}"] = nid
        for i, rid in enumerate(row_ids_in_scope):
            params[f"r{i}"] = rid

        node_placeholders = ", ".join(f":n{i}" for i in range(len(all_node_ids)))
        row_placeholders = ", ".join(f":r{i}" for i in range(len(row_ids_in_scope)))

        doc_part = ""
        if all_node_ids:
            doc_part = f"""
                SELECT n.id AS node_id, NULL::uuid AS row_id, n.content_plain_text AS chunk_text,
                       GREATEST(similarity(n.content_plain_text, :query), 0.5) AS fuzzy_score
                FROM knowledge_node n
                WHERE n.node_type = 'document' AND n.id IN ({node_placeholders})
                  AND n.is_deleted = false
                  AND n.content_plain_text IS NOT NULL
                  AND length(n.content_plain_text) >= 2
                  AND (
                    similarity(n.content_plain_text, :query) > :threshold
                    OR n.content_plain_text ILIKE :ilike_pattern
                  )
            """
        row_part = ""
        if row_ids_in_scope:
            row_part = f"""
                SELECT r.dataset_id AS node_id, r.id AS row_id, r.data_plain_text AS chunk_text,
                       GREATEST(similarity(r.data_plain_text, :query), 0.5) AS fuzzy_score
                FROM dataset_row r
                WHERE r.id IN ({row_placeholders})
                  AND r.is_deleted = false
                  AND r.data_plain_text IS NOT NULL
                  AND length(r.data_plain_text) >= 2
                  AND (
                    similarity(r.data_plain_text, :query) > :threshold
                    OR r.data_plain_text ILIKE :ilike_pattern
                  )
            """

        if not doc_part and not row_part:
            return []

        union_parts = [p.strip() for p in [doc_part, row_part] if p.strip()]
        sql_str = " UNION ALL ".join(union_parts) + " ORDER BY fuzzy_score DESC LIMIT :limit"
        sql = sa_text(sql_str)
        rows = db.execute(sql, params).fetchall()
        return [
            {
                "chunk_id": None,
                "node_id": r.node_id,
                "row_id": r.row_id,
                "chunk_text": r.chunk_text,
                "parent_id": None,
                "score": float(r.fuzzy_score),
                "fuzzy_score": float(r.fuzzy_score),
                "vector_score": 0.0,
            }
            for r in rows
        ]

    def _knowledge_vector_search(
        self,
        db: Session,
        query: str,
        scope_sql: str,
        params: dict[str, Any],
        limit: int,
    ) -> list[dict]:
        from sqlalchemy import text as sa_text

        try:
            embedding_svc, model_config = get_active_embedding_service(db, "document")
        except Exception:
            return []
        qvec = embedding_svc.generate_query_embedding(query)
        if not qvec:
            return []

        vec_str = "[" + ",".join(map(str, qvec)) + "]"
        cast_expr = model_config.index_cast
        params = {
            **params,
            "vec": vec_str,
            "model_id": model_config.model_id,
            "threshold": 0.1,
            "limit": limit,
        }
        # Escape :: after :vec so SQLAlchemy doesn't parse :halfvec as bind param
        sql = sa_text(f"""
            SELECT e.id, e.node_id, e.row_id, e.chunk_text, e.parent_id,
                   (1 - (e.embedding::{cast_expr} <=> :vec\\:\\:{cast_expr})) AS vector_score
            FROM knowledge_embedding e
            WHERE ({scope_sql})
              AND e.model_id = :model_id
              AND e.status = 'completed'
              AND (1 - (e.embedding::{cast_expr} <=> :vec\\:\\:{cast_expr})) > :threshold
            ORDER BY e.embedding::{cast_expr} <=> :vec\\:\\:{cast_expr}
            LIMIT :limit
        """)
        rows = db.execute(sql, params).fetchall()
        return [
            {
                "chunk_id": r.id,
                "node_id": r.node_id,
                "row_id": r.row_id,
                "chunk_text": r.chunk_text,
                "parent_id": r.parent_id,
                "score": float(r.vector_score),
                "fuzzy_score": 0.0,
                "vector_score": float(r.vector_score),
            }
            for r in rows
        ]

    def _fusion_key(self, r: dict) -> str:
        """Key for (node_id, row_id) - used when fusing fuzzy (direct) with vector."""
        nid = r.get("node_id")
        rid = r.get("row_id")
        return f"{nid}_{rid or 'doc'}"

    def _rrf_fusion_by_node_row(
        self,
        list_a: list[dict],
        list_b: list[dict],
        weight_a: float,
        weight_b: float,
        top_k: int,
    ) -> list[dict]:
        """RRF fusion by (node_id, row_id). Aggregates vector chunks to best per node/row."""
        if not list_b:
            return list_a[:top_k]
        # Aggregate vector results: keep best chunk per (node_id, row_id)
        best_per_key: dict[str, dict] = {}
        for r in list_b:
            key = self._fusion_key(r)
            if key not in best_per_key or (
                (r.get("vector_score") or 0)
                > (best_per_key[key].get("vector_score") or 0)
            ):
                best_per_key[key] = dict(r)
        list_b_agg = list(best_per_key.values())

        k = self.RRF_K
        ranks_a = {self._fusion_key(r): rank for rank, r in enumerate(list_a, start=1)}
        ranks_b = {
            self._fusion_key(r): rank for rank, r in enumerate(list_b_agg, start=1)
        }
        all_results: dict[str, dict] = {}
        for r in list_a + list_b_agg:
            key = self._fusion_key(r)
            if key not in all_results:
                all_results[key] = dict(r)
            else:
                # Merge: keep chunk info from vector if present, merge scores
                existing = all_results[key]
                if r.get("vector_score") is not None and (
                    existing.get("vector_score") is None
                    or (r.get("vector_score") or 0) > (existing.get("vector_score") or 0)
                ):
                    existing["vector_score"] = r.get("vector_score")
                    existing["chunk_id"] = r.get("chunk_id")
                    existing["chunk_text"] = r.get("chunk_text") or existing.get(
                        "chunk_text"
                    )
                    existing["parent_id"] = r.get("parent_id")
                if r.get("fuzzy_score") is not None and r.get("fuzzy_score", 0) > 0:
                    existing["fuzzy_score"] = max(
                        r.get("fuzzy_score") or 0,
                        existing.get("fuzzy_score") or 0,
                    )
        scored = []
        for key, result in all_results.items():
            rank_a = ranks_a.get(key)
            rank_b = ranks_b.get(key)
            rrf_a = (1.0 / (k + rank_a)) if rank_a else 0.0
            rrf_b = (1.0 / (k + rank_b)) if rank_b else 0.0
            result["score"] = weight_a * rrf_a + weight_b * rrf_b
            result["fuzzy_score"] = (
                list_a[ranks_a[key] - 1]["fuzzy_score"] if rank_a else 0.0
            )
            if rank_b:
                result["vector_score"] = list_b_agg[ranks_b[key] - 1].get(
                    "vector_score", 0.0
                )
            scored.append(result)
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def _rrf_fusion(
        self,
        list_a: list[dict],
        list_b: list[dict],
        weight_a: float,
        weight_b: float,
        top_k: int,
    ) -> list[dict]:
        k = self.RRF_K
        id_key = "chunk_id"
        ranks_a = {str(r[id_key]): rank for rank, r in enumerate(list_a, start=1)}
        ranks_b = {str(r[id_key]): rank for rank, r in enumerate(list_b, start=1)}
        all_results = {}
        for r in list_a + list_b:
            rid = str(r[id_key])
            if rid not in all_results:
                all_results[rid] = dict(r)
        scored = []
        for rid, result in all_results.items():
            rank_a = ranks_a.get(rid)
            rank_b = ranks_b.get(rid)
            rrf_a = (1.0 / (k + rank_a)) if rank_a else 0.0
            rrf_b = (1.0 / (k + rank_b)) if rank_b else 0.0
            result["score"] = weight_a * rrf_a + weight_b * rrf_b
            result["fuzzy_score"] = list_a[rank_a - 1]["fuzzy_score"] if rank_a else 0.0
            result["vector_score"] = (
                list_b[rank_b - 1]["vector_score"] if rank_b else 0.0
            )
            scored.append(result)
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def _enrich_search_hits(self, db: Session, raw_results: list[dict]) -> list[SearchHit]:
        hits: list[SearchHit] = []
        for r in raw_results:
            node_name = ""
            node_type = ""
            parent_content: Optional[str] = None
            if r.get("row_id"):
                row_obj = db.get(DatasetRow, r["row_id"])
                if row_obj:
                    ds = db.get(KnowledgeNode, row_obj.dataset_id)
                    if ds:
                        node_name = ds.name
                        node_type = "dataset_row"
            elif r.get("node_id"):
                n = db.get(KnowledgeNode, r["node_id"])
                if n:
                    node_name = n.name
                    node_type = n.node_type
            if r.get("parent_id"):
                parent_emb = db.get(KnowledgeEmbedding, r["parent_id"])
                if parent_emb and parent_emb.chunk_text:
                    parent_content = parent_emb.chunk_text[:500]
            hits.append(
                SearchHit(
                    node_id=r.get("node_id"),
                    row_id=r.get("row_id"),
                    chunk_id=r.get("chunk_id"),
                    node_name=node_name,
                    node_type=node_type,
                    content_preview=(r.get("chunk_text") or "")[:200],
                    score=r.get("score"),
                    fuzzy_score=r.get("fuzzy_score"),
                    vector_score=r.get("vector_score"),
                    parent_content=parent_content,
                )
            )
        return hits
