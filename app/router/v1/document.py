"""Document Store API endpoints."""

from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.schema.document import (
    CollectionCreate,
    CollectionUpdate,
    CollectionResponse,
    CollectionListResponse,
    VectorizeRequest,
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListResponse,
    DocumentListQuery,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentSearchHit,
)
from app.service.document import DocumentService
from app.service.background_task import BackgroundTaskService, run_task_in_background

router = APIRouter(prefix="/documents", tags=["documents"])
document_service = DocumentService()


# ---------- Collection ----------

@router.get(
    "/collections",
    response_model=CollectionListResponse,
    summary="List document collections",
)
def list_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all document collections for the current user."""
    items = document_service.list_collections(db, current_user.id)
    return CollectionListResponse(
        items=[CollectionResponse.model_validate(c) for c in items],
        total=len(items),
    )


@router.post(
    "/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create collection",
)
def create_collection(
    data: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new document collection."""
    try:
        coll = document_service.create_collection(db, current_user.id, data)
        return CollectionResponse.model_validate(coll)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/collections/{collection_id}",
    response_model=CollectionResponse,
    summary="Get collection",
)
def get_collection(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a collection by ID."""
    coll = document_service.get_collection(db, collection_id, current_user.id)
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionResponse.model_validate(coll)


@router.put(
    "/collections/{collection_id}",
    response_model=CollectionResponse,
    summary="Update collection",
)
def update_collection(
    collection_id: UUID,
    data: CollectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a collection."""
    coll = document_service.update_collection(db, collection_id, current_user.id, data)
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionResponse.model_validate(coll)


@router.delete(
    "/collections/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete collection",
)
def delete_collection(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete a collection."""
    ok = document_service.delete_collection(db, collection_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Collection not found")


@router.post(
    "/collections/{collection_id}/vectorize",
    response_model=CollectionResponse,
    summary="Enable or disable vectorization",
)
def set_vectorization(
    collection_id: UUID,
    data: VectorizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable or disable vectorization on a collection. When enabling, triggers async batch vectorization."""
    coll = document_service.set_vectorization(
        db, collection_id, current_user.id, data.enabled
    )
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    if data.enabled:
        from app.service.background_task import execute_vectorize_collection_task

        task = BackgroundTaskService.create_task(
            db=db,
            user_id=current_user.id,
            task_type="vectorize_collection",
            params={"collection_id": str(collection_id)},
        )
        run_task_in_background(
            execute_vectorize_collection_task,
            task.id,
            user_id=current_user.id,
            collection_id=collection_id,
        )
    return CollectionResponse.model_validate(coll)


# ---------- Document ----------

@router.get(
    "/collections/{collection_id}/docs",
    response_model=DocumentListResponse,
    summary="List documents",
)
def list_documents(
    collection_id: UUID,
    page: int = 1,
    size: int = 20,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List documents in a collection with optional filters (filters/sort via body in future)."""
    filters = None  # TODO: accept filters via query params or body
    sort = None
    docs, total = document_service.list_documents(
        db,
        collection_id,
        current_user.id,
        page=page,
        size=size,
        filters=filters,
        sort=sort,
        include_deleted=include_deleted,
    )
    pages = ceil(total / size) if total > 0 else 0
    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in docs],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


@router.post(
    "/collections/{collection_id}/docs",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create document",
)
def create_document(
    collection_id: UUID,
    data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a document in a collection."""
    try:
        doc = document_service.create_document(
            db, collection_id, current_user.id, data
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Collection not found")
        return DocumentResponse.model_validate(doc)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/docs/{document_id}",
    response_model=DocumentResponse,
    summary="Get document",
)
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a document by ID."""
    doc = document_service.get_document(db, document_id, current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(doc)


@router.put(
    "/docs/{document_id}",
    response_model=DocumentResponse,
    summary="Update document",
)
def update_document(
    document_id: UUID,
    data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a document."""
    try:
        doc = document_service.update_document(db, document_id, current_user.id, data)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return DocumentResponse.model_validate(doc)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/docs/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete document",
)
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete a document."""
    ok = document_service.delete_document(db, document_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")


# ---------- Search ----------

@router.post(
    "/search",
    response_model=DocumentSearchResponse,
    summary="Search documents",
)
def search_documents(
    data: DocumentSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hybrid search: vector (semantic) + structured filters."""
    hits, total = document_service.search(
        db,
        current_user.id,
        collection_ids=data.collection_ids,
        query=data.query,
        filters=data.filters,
        top_k=data.top_k,
        min_score=data.min_score,
        page=data.page,
        size=data.size,
    )
    pages = ceil(total / data.size) if total > 0 else 0
    return DocumentSearchResponse(
        hits=[
            DocumentSearchHit(
                document=DocumentResponse.model_validate(d),
                score=s,
            )
            for d, s in hits
        ],
        total=total,
        page=data.page,
        size=data.size,
        pages=pages,
    )
