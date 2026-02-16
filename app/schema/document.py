"""
Document Store API schemas.

Provides request/response models for:
- Collection CRUD
- Document CRUD
- Search (vector + structured filter)
- Filter DSL for structured queries
"""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


# =============================================================================
# Schema Definition (for structured collections)
# =============================================================================

FIELD_TYPES = (
    "text",
    "number",
    "date",
    "datetime",
    "boolean",
    "select",
    "multi_select",
    "url",
)


class FieldDefinition(BaseModel):
    """Single field definition in a structured collection schema."""

    name: str = Field(..., description="Field name")
    type: Literal[
        "text", "number", "date", "datetime", "boolean", "select", "multi_select", "url"
    ] = Field(..., description="Field type")
    required: bool = Field(False, description="Whether the field is required")
    description: Optional[str] = Field(None, description="Field description")
    options: Optional[list[str]] = Field(
        None, description="Options for select/multi_select fields"
    )
    default: Optional[Any] = Field(None, description="Default value")


class SchemaDefinition(BaseModel):
    """Schema definition for structured collections."""

    fields: list[FieldDefinition] = Field(default_factory=list, description="Field list")


# =============================================================================
# Collection Schemas
# =============================================================================


class CollectionCreate(BaseModel):
    """Request to create a collection."""

    name: str = Field(..., min_length=1, max_length=255, description="Collection name")
    description: Optional[str] = Field(None, description="Collection description")
    type: Literal["structured", "unstructured"] = Field(
        ..., description="structured | unstructured"
    )
    schema_definition: Optional[SchemaDefinition] = Field(
        None,
        description="Field definitions (required for structured type)",
    )


class CollectionUpdate(BaseModel):
    """Request to update a collection."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None)
    schema_definition: Optional[SchemaDefinition] = Field(None)


class CollectionResponse(BaseModel):
    """Collection response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    type: str
    schema_definition: Optional[dict] = None
    vector_enabled: bool = False
    settings: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False


class CollectionListResponse(BaseModel):
    """List of collections."""

    items: list[CollectionResponse] = Field(default_factory=list)
    total: int = 0


# =============================================================================
# Vectorize Request
# =============================================================================


class VectorizeRequest(BaseModel):
    """Request to enable/disable vectorization on a collection."""

    enabled: bool = Field(..., description="Enable or disable vectorization")


# =============================================================================
# Document Schemas
# =============================================================================


class DocumentCreate(BaseModel):
    """Request to create a document."""

    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., min_length=1, max_length=500, description="Document title")
    content: Optional[str] = Field(
        None,
        description="Unstructured content (Markdown/plain text) - for unstructured collections",
    )
    data: Optional[dict[str, Any]] = Field(
        None,
        description="Structured data - for structured collections",
    )
    metadata_: Optional[dict[str, Any]] = Field(
        None,
        alias="metadata",
        description="Labels, tags, custom attributes",
    )


class DocumentUpdate(BaseModel):
    """Request to update a document (partial)."""

    model_config = ConfigDict(populate_by_name=True)

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = Field(None)
    data: Optional[dict[str, Any]] = Field(None)
    metadata_: Optional[dict[str, Any]] = Field(None, alias="metadata")


class DocumentResponse(BaseModel):
    """Document response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    collection_id: UUID
    title: str
    content: Optional[str] = None
    data: Optional[dict] = None
    metadata_: Optional[dict] = Field(
        None,
        alias="metadata",
        serialization_alias="metadata",
        validation_alias=AliasChoices("metadata_", "metadata"),
    )
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False


class DocumentListResponse(BaseModel):
    """Paginated list of documents."""

    items: list[DocumentResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    size: int = 20
    pages: int = 0


# =============================================================================
# Filter DSL for structured queries
# =============================================================================

FilterOp = Literal["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "starts_with"]


class FilterCondition(BaseModel):
    """Single filter condition for structured document queries."""

    field: str = Field(..., description="Field name (must exist in schema)")
    op: FilterOp = Field(..., description="Comparison operator")
    value: Any = Field(..., description="Value to compare against")


class SortSpec(BaseModel):
    """Sort specification."""

    field: str = Field(..., description="Field to sort by")
    order: Literal["asc", "desc"] = Field("desc", description="Sort order")


# =============================================================================
# Document List Query (with filters)
# =============================================================================


class DocumentListQuery(BaseModel):
    """Query params for listing documents with filters."""

    page: int = Field(1, ge=1, description="Page number")
    size: int = Field(20, ge=1, le=100, description="Page size")
    filters: Optional[list[FilterCondition]] = Field(None, description="Filter conditions")
    sort: Optional[SortSpec] = Field(None, description="Sort specification")
    include_deleted: bool = Field(False, description="Include soft-deleted documents")


# =============================================================================
# Search (vector + filter)
# =============================================================================


class DocumentSearchRequest(BaseModel):
    """Request for hybrid search (vector + structured filter)."""

    collection_ids: Optional[list[UUID]] = Field(
        None,
        description="Limit search to these collections (None = all user collections)",
    )
    query: Optional[str] = Field(
        None,
        description="Natural language query for vector search (requires vector_enabled on collection)",
    )
    filters: Optional[list[FilterCondition]] = Field(
        None,
        description="Structured filters (only for structured collections)",
    )
    top_k: int = Field(10, ge=1, le=100, description="Max results for vector search")
    min_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Minimum similarity score (0-1) for vector results",
    )
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)


class DocumentSearchHit(BaseModel):
    """Single search result with optional score."""

    document: DocumentResponse
    score: Optional[float] = Field(None, description="Similarity score (for vector results)")


class DocumentSearchResponse(BaseModel):
    """Search response."""

    hits: list[DocumentSearchHit] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    size: int = 20
    pages: int = 0
