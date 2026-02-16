"""
Knowledge Base Tools — Read/write user's knowledge base (folders, documents, datasets).

Independent from the filesystem module.
"""

import json
from typing import Optional
from uuid import UUID

from app.agent.tools.registry import ToolRegistry
from app.agent.tools.context import agent_user_id
from app.db.session import SessionLocal
from app.service.knowledge import KnowledgeService
from app.schema.knowledge import (
    NodeCreate,
    NodeUpdate,
    RowCreate,
    RowUpdate,
    FilterCondition,
    SortSpec,
)


svc = KnowledgeService()


def _get_user_id() -> Optional[UUID]:
    return agent_user_id.get()


# ---------- List tree ----------

@ToolRegistry.register(
    name="list_knowledge_tree",
    description=(
        "List the user's knowledge base tree structure. "
        "Returns folders, documents, and datasets with their hierarchy. "
        "Use this to discover available content before reading or querying."
    ),
    category="knowledge_base",
)
def list_knowledge_tree() -> str:
    """List the knowledge base tree."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    with SessionLocal() as db:
        tree = svc.get_tree(db, user_id)
        if not tree:
            return "Knowledge base is empty. No folders or documents found."

        lines = ["Knowledge Base:\n"]

        def render(items, indent=0):
            prefix = "  " * indent
            for item in items:
                icon = {"folder": "📁", "document": "📄", "dataset": "📊"}.get(
                    item.node_type, "📎"
                )
                vec = " [vectorized]" if item.vector_enabled else ""
                schema_hint = ""
                if item.node_type == "dataset" and item.schema_definition:
                    cols = [
                        f["name"]
                        for f in (item.schema_definition.get("fields") or [])[:5]
                    ]
                    if cols:
                        schema_hint = f" | columns: {', '.join(cols)}"
                lines.append(
                    f"{prefix}{icon} {item.name} (id: {item.id}, "
                    f"type: {item.node_type}{vec}{schema_hint})"
                )
                if item.children:
                    render(item.children, indent + 1)

        render(tree)
        return "\n".join(lines)


# ---------- Read document ----------

@ToolRegistry.register(
    name="read_document",
    description=(
        "Read a document's content by its node ID. "
        "Returns the full Markdown / rich text content."
    ),
    category="knowledge_base",
)
def read_document(node_id: str) -> str:
    """Read a document node's content."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."
    try:
        nid = UUID(node_id)
    except ValueError:
        return f"Error: Invalid node_id: {node_id}"

    with SessionLocal() as db:
        node = svc.get_node(db, nid, user_id)
        if not node:
            return "Document not found."
        if node.node_type != "document":
            return f"Node is a {node.node_type}, not a document. Use query_dataset for datasets."
        return f"# {node.name}\n\n{node.content or '(empty)'}"


# ---------- Query dataset ----------

@ToolRegistry.register(
    name="query_dataset",
    description=(
        "Query rows in a dataset (structured data table). "
        "Supports filtering by column values and sorting. "
        "Provide dataset_id (node ID of the dataset)."
    ),
    category="knowledge_base",
)
def query_dataset(
    dataset_id: str,
    filters_json: str = "",
    sort_field: str = "",
    sort_order: str = "asc",
    page: int = 1,
    size: int = 20,
) -> str:
    """Query dataset rows."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."
    try:
        ds_id = UUID(dataset_id)
    except ValueError:
        return f"Error: Invalid dataset_id: {dataset_id}"

    filters = None
    if filters_json:
        try:
            raw = json.loads(filters_json)
            if isinstance(raw, list):
                filters = [FilterCondition.model_validate(f) for f in raw]
        except Exception as e:
            return f"Error: Invalid filters_json: {e}"

    sort = SortSpec(field=sort_field, order=sort_order) if sort_field else None

    with SessionLocal() as db:
        rows, total = svc.list_rows(
            db, ds_id, user_id, page=page, size=size, filters=filters, sort=sort
        )
        if total == 0:
            return "No rows found in this dataset."

        lines = [f"Found {total} row(s) (page {page}):\n"]
        for row in rows:
            data_str = json.dumps(row.data, ensure_ascii=False)
            lines.append(f"- Row {row.id}: {data_str[:200]}")
        return "\n".join(lines)


# ---------- Create node ----------

@ToolRegistry.register(
    name="create_knowledge_node",
    description=(
        "Create a new node in the knowledge base. "
        "node_type: 'folder', 'document', or 'dataset'. "
        "For documents, provide 'content' (Markdown text). "
        "For datasets, optionally provide columns_json with column definitions."
    ),
    category="knowledge_base",
)
def create_knowledge_node(
    name: str,
    node_type: str,
    parent_id: str = "",
    content: str = "",
    columns_json: str = "",
) -> str:
    """Create a knowledge node."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    pid = None
    if parent_id:
        try:
            pid = UUID(parent_id)
        except ValueError:
            return f"Error: Invalid parent_id: {parent_id}"

    schema_def = None
    if columns_json:
        try:
            schema_def = json.loads(columns_json)
        except Exception as e:
            return f"Error: Invalid columns_json: {e}"

    from app.schema.knowledge import SchemaDefinition

    data = NodeCreate(
        name=name,
        node_type=node_type,
        parent_id=pid,
        content=content or None,
        schema_definition=SchemaDefinition(**schema_def) if schema_def else None,
    )
    with SessionLocal() as db:
        try:
            node = svc.create_node(db, user_id, data)
            return f"Node created. ID: {node.id}, type: {node.node_type}"
        except ValueError as e:
            return f"Error: {e}"


# ---------- Update document ----------

@ToolRegistry.register(
    name="update_document",
    description="Update a document's content or name.",
    category="knowledge_base",
)
def update_document(
    node_id: str,
    name: str = "",
    content: str = "",
) -> str:
    """Update a document node."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."
    try:
        nid = UUID(node_id)
    except ValueError:
        return f"Error: Invalid node_id: {node_id}"

    updates: dict = {}
    if name:
        updates["name"] = name
    if content:
        updates["content"] = content
    if not updates:
        return "Error: Provide name or content to update."

    data = NodeUpdate(**updates)
    with SessionLocal() as db:
        try:
            node = svc.update_node(db, nid, user_id, data)
            if not node:
                return "Document not found."
            return f"Document updated. ID: {node.id}"
        except ValueError as e:
            return f"Error: {e}"


# ---------- Create dataset row ----------

@ToolRegistry.register(
    name="create_dataset_row",
    description=(
        "Add a new row to a dataset. Provide dataset_id and data_json "
        "(a JSON object with column values matching the dataset schema)."
    ),
    category="knowledge_base",
)
def create_dataset_row(dataset_id: str, data_json: str) -> str:
    """Create a row in a dataset."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."
    try:
        ds_id = UUID(dataset_id)
    except ValueError:
        return f"Error: Invalid dataset_id: {dataset_id}"
    try:
        row_data = json.loads(data_json)
    except Exception as e:
        return f"Error: Invalid data_json: {e}"

    data = RowCreate(data=row_data)
    with SessionLocal() as db:
        try:
            row = svc.create_row(db, ds_id, user_id, data)
            if not row:
                return "Dataset not found."
            return f"Row created. ID: {row.id}"
        except ValueError as e:
            return f"Error: {e}"


# ---------- Update dataset row ----------

@ToolRegistry.register(
    name="update_dataset_row",
    description="Update a dataset row. Provide row_id and data_json.",
    category="knowledge_base",
)
def update_dataset_row(row_id: str, data_json: str) -> str:
    """Update a dataset row."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."
    try:
        rid = UUID(row_id)
    except ValueError:
        return f"Error: Invalid row_id: {row_id}"
    try:
        row_data = json.loads(data_json)
    except Exception as e:
        return f"Error: Invalid data_json: {e}"

    data = RowUpdate(data=row_data)
    with SessionLocal() as db:
        try:
            row = svc.update_row(db, rid, user_id, data)
            if not row:
                return "Row not found."
            return f"Row updated. ID: {row.id}"
        except ValueError as e:
            return f"Error: {e}"


# ---------- Search ----------

@ToolRegistry.register(
    name="search_knowledge",
    description=(
        "Semantic search across the knowledge base. "
        "Requires vectorization to be enabled on the target folder(s). "
        "Returns matching documents and dataset rows with relevance scores."
    ),
    category="knowledge_base",
)
def search_knowledge(
    query: str,
    folder_ids_json: str = "",
    top_k: int = 10,
) -> str:
    """Search the knowledge base."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    folder_ids = None
    if folder_ids_json:
        try:
            raw = json.loads(folder_ids_json)
            folder_ids = [UUID(fid) for fid in raw]
        except Exception as e:
            return f"Error: Invalid folder_ids_json: {e}"

    with SessionLocal() as db:
        hits, total = svc.search(
            db, user_id, folder_ids=folder_ids, query=query, top_k=top_k
        )
        if not hits:
            return "No results found."

        lines = [f"Found {total} result(s):\n"]
        for h in hits:
            score_str = f" (score: {h.score:.2f})" if h.score is not None else ""
            lines.append(
                f"- [{h.node_type}] {h.node_name}{score_str}\n"
                f"  Preview: {h.content_preview[:150]}..."
            )
        return "\n".join(lines)
