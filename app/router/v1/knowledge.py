"""Knowledge Base API endpoints."""

import uuid
from math import ceil
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
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
    VectorizationConfig,
    VectorizationConfigUpdate,
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


# ========================== Embedding Models ==========================


@router.get("/embedding-models", summary="List available embedding models")
def list_embedding_models() -> dict:
    """Return available embedding model IDs and metadata."""
    from app.config.embedding import EMBEDDING_MODELS

    models = [
        {
            "model_id": m.model_id,
            "dimensions": m.dimensions,
            "provider": m.provider,
        }
        for m in EMBEDDING_MODELS.values()
    ]
    return {"models": models}


# Upload directory for knowledge base images (project root)
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
UPLOAD_DIR = _PROJECT_ROOT / "uploads" / "knowledge"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# ========================== Image Upload ==========================


@router.post("/upload-image", summary="Upload image for knowledge base")
def upload_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Upload an image file and return its URL. Used by the Novel editor."""
    if not file.filename:
        raise HTTPException(400, "No filename")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    try:
        content = file.file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File too large. Max size: {MAX_FILE_SIZE // (1024*1024)}MB")
    finally:
        file.file.seek(0)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / safe_name
    with open(dest, "wb") as f:
        f.write(content)

    base = str(request.base_url).rstrip("/")
    url = f"{base}/uploads/knowledge/{safe_name}"
    return {"url": url}


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


@router.patch(
    "/nodes/{node_id}/vectorization-config",
    response_model=NodeResponse,
    summary="Update vectorization config",
)
def update_vectorization_config(
    node_id: UUID,
    data: VectorizationConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update vectorization config for a folder. Requires re-vectorization to take effect."""
    node = svc.get_node(db, node_id, current_user.id)
    if not node:
        raise HTTPException(404, "Node not found")
    if node.node_type != "folder":
        raise HTTPException(400, "Vectorization config can only be set on folders")

    current = (
        VectorizationConfig.model_validate(node.vectorization_config)
        if node.vectorization_config
        else VectorizationConfig()
    )
    update_data = data.model_dump(exclude_none=True)
    if "preprocessing_rules" in update_data and update_data["preprocessing_rules"]:
        pr = update_data["preprocessing_rules"]
        if isinstance(pr, dict):
            current.preprocessing_rules = current.preprocessing_rules.model_copy(
                update=pr
            )
        else:
            current.preprocessing_rules = pr
        del update_data["preprocessing_rules"]
    merged = current.model_copy(update=update_data)
    node = svc.update_node(
        db,
        node_id,
        current_user.id,
        NodeUpdate(vectorization_config=merged),
    )
    return NodeResponse.model_validate(node)


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
        search_mode=data.search_mode,
        fuzzy_weight=data.fuzzy_weight,
        vector_weight=data.vector_weight,
        top_k=data.top_k,
        min_score=data.min_score,
        page=data.page,
        size=data.size,
    )
    return KnowledgeSearchResponse(hits=hits, total=total)
