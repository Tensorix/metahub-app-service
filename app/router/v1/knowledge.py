"""Knowledge Base API endpoints."""

from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.schema.knowledge import (
    NodeCreate,
    NodeUpdate,
    NodeMove,
    NodeResponse,
    TreeResponse,
    VectorizeRequest,
    RowCreate,
    RowUpdate,
    RowResponse,
    RowListResponse,
    ColumnAdd,
    ColumnUpdate,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    FilterCondition,
    SortSpec,
)
from app.service.knowledge import KnowledgeService
from app.service.background_task import BackgroundTaskService, run_task_in_background

router = APIRouter(prefix="/knowledge", tags=["knowledge"])
svc = KnowledgeService()


# ========================== Tree ==========================


@router.get("/tree", response_model=TreeResponse, summary="Get knowledge tree")
def get_tree(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = svc.get_tree(db, current_user.id)
    return TreeResponse(items=items)


# ========================== Node CRUD ==========================


@router.get("/nodes/{node_id}", response_model=NodeResponse, summary="Get node")
def get_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    node = svc.get_node(db, node_id, current_user.id)
    if not node:
        raise HTTPException(404, "Node not found")
    return NodeResponse.model_validate(node)


@router.post(
    "/nodes",
    response_model=NodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create node",
)
def create_node(
    data: NodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        node = svc.create_node(db, current_user.id, data)
        return NodeResponse.model_validate(node)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/nodes/{node_id}", response_model=NodeResponse, summary="Update node")
def update_node(
    node_id: UUID,
    data: NodeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        node = svc.update_node(db, node_id, current_user.id, data)
        if not node:
            raise HTTPException(404, "Node not found")
        return NodeResponse.model_validate(node)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete(
    "/nodes/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete node",
)
def delete_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not svc.delete_node(db, node_id, current_user.id):
        raise HTTPException(404, "Node not found")


@router.post(
    "/nodes/{node_id}/move",
    response_model=NodeResponse,
    summary="Move node",
)
def move_node(
    node_id: UUID,
    data: NodeMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        node = svc.move_node(db, node_id, current_user.id, data)
        if not node:
            raise HTTPException(404, "Node not found")
        return NodeResponse.model_validate(node)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ========================== Vectorize ==========================


@router.post(
    "/nodes/{node_id}/vectorize",
    response_model=NodeResponse,
    summary="Enable/disable vectorization",
)
def set_vectorization(
    node_id: UUID,
    data: VectorizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    node = svc.get_node(db, node_id, current_user.id)
    if not node:
        raise HTTPException(404, "Node not found")
    if node.node_type != "folder":
        raise HTTPException(400, "Vectorization can only be set on folders")

    node = svc.update_node(
        db,
        node_id,
        current_user.id,
        NodeUpdate(vector_enabled=data.enabled),
    )

    if data.enabled:
        from app.service.background_task import execute_vectorize_folder_task

        task = BackgroundTaskService.create_task(
            db=db,
            user_id=current_user.id,
            task_type="vectorize_folder",
            params={"folder_id": str(node_id)},
        )
        run_task_in_background(
            execute_vectorize_folder_task,
            task.id,
            user_id=current_user.id,
            folder_id=node_id,
        )

    return NodeResponse.model_validate(node)


# ========================== Dataset Rows ==========================


@router.get(
    "/datasets/{dataset_id}/rows",
    response_model=RowListResponse,
    summary="List dataset rows",
)
def list_rows(
    dataset_id: UUID,
    page: int = 1,
    size: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows, total = svc.list_rows(db, dataset_id, current_user.id, page=page, size=size)
    pages = ceil(total / size) if total > 0 else 0
    return RowListResponse(
        items=[RowResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


@router.post(
    "/datasets/{dataset_id}/rows",
    response_model=RowResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create row",
)
def create_row(
    dataset_id: UUID,
    data: RowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = svc.create_row(db, dataset_id, current_user.id, data)
        if not row:
            raise HTTPException(404, "Dataset not found")
        return RowResponse.model_validate(row)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch(
    "/datasets/{dataset_id}/rows/{row_id}",
    response_model=RowResponse,
    summary="Update row",
)
def update_row(
    dataset_id: UUID,
    row_id: UUID,
    data: RowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        row = svc.update_row(db, row_id, current_user.id, data)
        if not row:
            raise HTTPException(404, "Row not found")
        return RowResponse.model_validate(row)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete(
    "/datasets/{dataset_id}/rows/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete row",
)
def delete_row(
    dataset_id: UUID,
    row_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not svc.delete_row(db, row_id, current_user.id):
        raise HTTPException(404, "Row not found")


# ========================== Dataset Schema ==========================


@router.post(
    "/datasets/{dataset_id}/columns",
    response_model=NodeResponse,
    summary="Add column",
)
def add_column(
    dataset_id: UUID,
    data: ColumnAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        node = svc.add_column(db, dataset_id, current_user.id, data)
        if not node:
            raise HTTPException(404, "Dataset not found")
        return NodeResponse.model_validate(node)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch(
    "/datasets/{dataset_id}/columns/{col_name}",
    response_model=NodeResponse,
    summary="Update column",
)
def update_column(
    dataset_id: UUID,
    col_name: str,
    data: ColumnUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        node = svc.update_column(db, dataset_id, current_user.id, col_name, data)
        if not node:
            raise HTTPException(404, "Dataset not found")
        return NodeResponse.model_validate(node)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete(
    "/datasets/{dataset_id}/columns/{col_name}",
    response_model=NodeResponse,
    summary="Delete column",
)
def delete_column(
    dataset_id: UUID,
    col_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        node = svc.delete_column(db, dataset_id, current_user.id, col_name)
        if not node:
            raise HTTPException(404, "Dataset not found")
        return NodeResponse.model_validate(node)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ========================== Search ==========================


@router.post(
    "/search",
    response_model=KnowledgeSearchResponse,
    summary="Search knowledge base",
)
def search_knowledge(
    data: KnowledgeSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hits, total = svc.search(
        db,
        current_user.id,
        folder_ids=data.folder_ids,
        query=data.query,
        filters=data.filters,
        top_k=data.top_k,
        min_score=data.min_score,
        page=data.page,
        size=data.size,
    )
    return KnowledgeSearchResponse(hits=hits, total=total)
