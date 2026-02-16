"""
Knowledge Base API schemas.

Tree-based knowledge storage with three node types:
- folder:   container with optional vectorization
- document: rich text / Markdown content
- dataset:  structured table with schema + rows
"""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


NodeType = Literal["folder", "document", "dataset"]

# =============================================================================
# Schema Definition (for dataset columns)
# =============================================================================

FIELD_TYPES = (
    "text", "number", "date", "datetime", "boolean",
    "select", "multi_select", "url",
)


class FieldDefinition(BaseModel):
    """Single column definition in a dataset schema."""

    name: str = Field(..., description="Column name")
    type: Literal[
        "text", "number", "date", "datetime", "boolean",
        "select", "multi_select", "url",
    ] = Field(..., description="Column type")
    required: bool = Field(False, description="Whether the column is required")
    description: Optional[str] = Field(None, description="Column description")
    options: Optional[list[str]] = Field(
        None, description="Options for select / multi_select"
    )
    default: Optional[Any] = Field(None, description="Default value")
    width: Optional[int] = Field(None, description="Column display width (px)")


class SchemaDefinition(BaseModel):
    """Schema definition for dataset columns."""

    fields: list[FieldDefinition] = Field(
        default_factory=list, description="Column list"
    )


# =============================================================================
# Node CRUD
# =============================================================================


class NodeCreate(BaseModel):
    """Create a knowledge node."""

    name: str = Field(..., min_length=1, max_length=500)
    node_type: NodeType
    parent_id: Optional[UUID] = Field(None, description="Parent folder ID (null = root)")
    description: Optional[str] = None
    icon: Optional[str] = None
    position: Optional[int] = None

    # document fields
    content: Optional[str] = Field(None, description="Markdown content (document only)")

    # dataset fields
    schema_definition: Optional[SchemaDefinition] = Field(
        None, description="Column definitions (dataset only)"
    )


class NodeUpdate(BaseModel):
    """Partial update of a knowledge node."""

    name: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    icon: Optional[str] = None
    content: Optional[str] = None
    schema_definition: Optional[SchemaDefinition] = None
    vector_enabled: Optional[bool] = None


class NodeMove(BaseModel):
    """Move a node to a new parent / position."""

    parent_id: Optional[UUID] = Field(None, description="New parent ID (null = root)")
    position: Optional[int] = Field(None, description="New position among siblings")


class NodeResponse(BaseModel):
    """Single node response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    parent_id: Optional[UUID] = None
    user_id: UUID
    name: str
    node_type: str
    vector_enabled: bool = False
    content: Optional[str] = None
    schema_definition: Optional[dict] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    position: int = 0
    metadata_: Optional[dict] = Field(
        None,
        alias="metadata",
        serialization_alias="metadata",
        validation_alias=AliasChoices("metadata_", "metadata"),
    )
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False


class NodeTreeItem(BaseModel):
    """Node with nested children for tree response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    parent_id: Optional[UUID] = None
    name: str
    node_type: str
    vector_enabled: bool = False
    icon: Optional[str] = None
    position: int = 0
    has_content: bool = False
    schema_definition: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    children: list["NodeTreeItem"] = Field(default_factory=list)


class TreeResponse(BaseModel):
    """Full tree response."""

    items: list[NodeTreeItem] = Field(default_factory=list)


# =============================================================================
# Dataset Row CRUD
# =============================================================================


class RowCreate(BaseModel):
    """Create a dataset row."""

    data: dict[str, Any] = Field(default_factory=dict)
    position: Optional[int] = None


class RowUpdate(BaseModel):
    """Partial update of a dataset row."""

    data: Optional[dict[str, Any]] = None
    position: Optional[int] = None


class RowBatchUpdate(BaseModel):
    """Batch update of dataset rows."""

    updates: list[dict[str, Any]] = Field(
        ..., description="List of {id, data?, position?}"
    )


class RowResponse(BaseModel):
    """Single row response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dataset_id: UUID
    data: dict[str, Any] = Field(default_factory=dict)
    position: int = 0
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False


class RowListResponse(BaseModel):
    """Paginated row list."""

    items: list[RowResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    size: int = 50
    pages: int = 0


# =============================================================================
# Dataset Schema Mutation
# =============================================================================


class ColumnAdd(BaseModel):
    """Add a column to a dataset schema."""

    field: FieldDefinition


class ColumnUpdate(BaseModel):
    """Update a column definition."""

    name: Optional[str] = None
    type: Optional[str] = None
    required: Optional[bool] = None
    description: Optional[str] = None
    options: Optional[list[str]] = None
    width: Optional[int] = None


class ColumnDelete(BaseModel):
    """Delete a column from a dataset schema."""

    name: str


# =============================================================================
# Filter DSL (reusable for dataset rows)
# =============================================================================


FilterOp = Literal[
    "eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "starts_with"
]


class FilterCondition(BaseModel):
    """Single filter condition for dataset row queries."""

    field: str
    op: FilterOp
    value: Any


class SortSpec(BaseModel):
    """Sort specification."""

    field: str
    order: Literal["asc", "desc"] = "desc"


# =============================================================================
# Vectorize
# =============================================================================


class VectorizeRequest(BaseModel):
    """Enable / disable vectorization on a folder node."""

    enabled: bool


# =============================================================================
# Search
# =============================================================================


class KnowledgeSearchRequest(BaseModel):
    """Hybrid search: vector + structured filter."""

    folder_ids: Optional[list[UUID]] = Field(
        None, description="Limit to these folders (null = all)"
    )
    query: Optional[str] = Field(
        None, description="Natural language query for vector search"
    )
    filters: Optional[list[FilterCondition]] = None
    top_k: int = Field(10, ge=1, le=100)
    min_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)


class SearchHit(BaseModel):
    """Single search result."""

    node_id: Optional[UUID] = None
    row_id: Optional[UUID] = None
    node_name: str = ""
    node_type: str = ""
    content_preview: str = ""
    score: Optional[float] = None


class KnowledgeSearchResponse(BaseModel):
    """Search results."""

    hits: list[SearchHit] = Field(default_factory=list)
    total: int = 0
