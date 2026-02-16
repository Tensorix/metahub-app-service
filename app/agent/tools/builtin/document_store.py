"""
Document Store Tools - Read/write user's document collections.

Tools for agents to access the document store (structured and unstructured documents).
Independent from the filesystem module.
"""

import json
from typing import Optional
from uuid import UUID

from app.agent.tools.registry import ToolRegistry
from app.agent.tools.context import agent_user_id
from app.db.session import SessionLocal
from app.service.document import DocumentService
from app.schema.document import (
    CollectionCreate,
    DocumentCreate,
    DocumentUpdate,
    FilterCondition,
    SortSpec,
)


document_service = DocumentService()


def _get_user_id() -> Optional[UUID]:
    """Get user_id from agent context."""
    return agent_user_id.get()


def _with_db(fn):
    """Decorator to open db session for tool execution."""
    def wrapper(*args, **kwargs):
        user_id = _get_user_id()
        if user_id is None:
            return "Error: No user context available. Cannot access document store."
        with SessionLocal() as db:
            return fn(db, user_id, *args, **kwargs)
    return wrapper


@ToolRegistry.register(
    name="list_doc_collections",
    description=(
        "List the user's document collections. "
        "Returns collection name, type (structured/unstructured), and schema summary. "
        "Use this to discover available collections before querying or creating documents."
    ),
    category="document_store",
)
def list_doc_collections() -> str:
    """List available document collections."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available. Cannot list collections."

    with SessionLocal() as db:
        items = document_service.list_collections(db, user_id)
        if not items:
            return "No document collections found. Create one first."

        lines = [f"Found {len(items)} collection(s):\n"]
        for c in items:
            schema_preview = ""
            if c.schema_definition and c.schema_definition.get("fields"):
                fields = [f["name"] for f in c.schema_definition["fields"][:5]]
                schema_preview = f" | fields: {', '.join(fields)}"
            lines.append(
                f"- {c.name} (id: {c.id}, type: {c.type}, "
                f"vector_enabled: {c.vector_enabled}){schema_preview}"
            )
        return "\n".join(lines)


@ToolRegistry.register(
    name="query_documents",
    description=(
        "Query or search documents. Supports: "
        "1) List docs in a collection with optional filters; "
        "2) Semantic vector search when collection has vectorization enabled; "
        "3) Structured filters for structured collections (e.g., amount > 100). "
        "Use collection_id to target a specific collection."
    ),
    category="document_store",
)
def query_documents(
    collection_id: str,
    query: str = "",
    filters_json: str = "",
    sort_field: str = "",
    sort_order: str = "desc",
    top_k: int = 10,
    page: int = 1,
    size: int = 20,
) -> str:
    """
    Query documents in a collection.

    Args:
        collection_id: UUID of the collection.
        query: Natural language query for vector search (if collection has vectorization).
        filters_json: JSON array of filter conditions, e.g. [{"field":"amount","op":"gte","value":100}]
        sort_field: Field to sort by (for structured: field name; for list: title, created_at).
        sort_order: "asc" or "desc".
        top_k: Max results for vector search.
        page: Page number for pagination.
        size: Page size.

    Returns:
        Formatted list of matching documents.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        coll_uuid = UUID(collection_id)
    except ValueError:
        return f"Error: Invalid collection_id: {collection_id}"

    filters = None
    if filters_json:
        try:
            raw = json.loads(filters_json)
            if isinstance(raw, list):
                filters = [FilterCondition.model_validate(f) for f in raw]
        except Exception as e:
            return f"Error: Invalid filters_json: {e}"

    sort = None
    if sort_field:
        sort = SortSpec(field=sort_field, order=sort_order or "desc")

    with SessionLocal() as db:
        if query.strip():
            hits, total = document_service.search(
                db, user_id,
                collection_ids=[coll_uuid],
                query=query.strip(),
                filters=filters,
                top_k=top_k,
                page=page,
                size=size,
            )
            lines = [f"Found {total} document(s):\n"]
            for doc, score in hits:
                score_str = f" (score: {score:.2f})" if score is not None else ""
                lines.append(
                    f"- {doc.title} (id: {doc.id}){score_str}\n"
                    f"  Content preview: {(doc.content or str(doc.data) or '')[:150]}..."
                )
        else:
            docs, total = document_service.list_documents(
                db, coll_uuid, user_id,
                page=page,
                size=size,
                filters=filters,
                sort=sort,
            )
            lines = [f"Found {total} document(s):\n"]
            for doc in docs:
                lines.append(
                    f"- {doc.title} (id: {doc.id})\n"
                    f"  Preview: {(doc.content or str(doc.data) or '')[:150]}..."
                )
        return "\n".join(lines)


@ToolRegistry.register(
    name="read_document",
    description="Read a single document by its ID. Returns full content (for unstructured) or data (for structured).",
    category="document_store",
)
def read_document(document_id: str) -> str:
    """Read a document by ID."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        return f"Error: Invalid document_id: {document_id}"

    with SessionLocal() as db:
        doc = document_service.get_document(db, doc_uuid, user_id)
        if not doc:
            return f"Document not found: {document_id}"

        if doc.content:
            return f"Title: {doc.title}\n\nContent:\n{doc.content}"
        return f"Title: {doc.title}\n\nData:\n{json.dumps(doc.data or {}, ensure_ascii=False, indent=2)}"


@ToolRegistry.register(
    name="create_document",
    description=(
        "Create a new document in a collection. "
        "For structured collections, provide 'data' as JSON object matching the schema. "
        "For unstructured collections, provide 'content' (Markdown or plain text). "
        "Always provide 'title'."
    ),
    category="document_store",
)
def create_document(
    collection_id: str,
    title: str,
    content: str = "",
    data_json: str = "",
) -> str:
    """
    Create a document.

    Args:
        collection_id: UUID of the collection.
        title: Document title.
        content: Unstructured content (for unstructured collections).
        data_json: JSON object for structured data (for structured collections).

    Returns:
        Created document ID or error message.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        coll_uuid = UUID(collection_id)
    except ValueError:
        return f"Error: Invalid collection_id: {collection_id}"

    data_dict = None
    if data_json:
        try:
            data_dict = json.loads(data_json)
        except json.JSONDecodeError as e:
            return f"Error: Invalid data_json: {e}"

    payload = DocumentCreate(title=title, content=content or None, data=data_dict)
    with SessionLocal() as db:
        try:
            doc = document_service.create_document(db, coll_uuid, user_id, payload)
            if not doc:
                return "Error: Collection not found."
            return f"Document created successfully. ID: {doc.id}"
        except ValueError as e:
            return f"Error: {e}"


@ToolRegistry.register(
    name="update_document",
    description="Update an existing document. Provide document_id and fields to update (title, content, or data_json).",
    category="document_store",
)
def update_document(
    document_id: str,
    title: str = "",
    content: str = "",
    data_json: str = "",
) -> str:
    """
    Update a document.

    Args:
        document_id: UUID of the document.
        title: New title (optional).
        content: New content for unstructured (optional).
        data_json: New data JSON for structured (optional).

    Returns:
        Success or error message.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        return f"Error: Invalid document_id: {document_id}"

    updates = {}
    if title:
        updates["title"] = title
    if content:
        updates["content"] = content
    if data_json:
        try:
            updates["data"] = json.loads(data_json)
        except json.JSONDecodeError as e:
            return f"Error: Invalid data_json: {e}"

    if not updates:
        return "Error: Provide at least one field to update (title, content, or data_json)."

    payload = DocumentUpdate(**updates)
    with SessionLocal() as db:
        try:
            doc = document_service.update_document(db, doc_uuid, user_id, payload)
            if not doc:
                return "Document not found."
            return f"Document updated successfully. ID: {doc.id}"
        except ValueError as e:
            return f"Error: {e}"


@ToolRegistry.register(
    name="delete_document",
    description="Soft delete a document by ID.",
    category="document_store",
)
def delete_document(document_id: str) -> str:
    """Delete a document (soft delete)."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        doc_uuid = UUID(document_id)
    except ValueError:
        return f"Error: Invalid document_id: {document_id}"

    with SessionLocal() as db:
        ok = document_service.delete_document(db, doc_uuid, user_id)
        if not ok:
            return "Document not found."
        return "Document deleted successfully."
