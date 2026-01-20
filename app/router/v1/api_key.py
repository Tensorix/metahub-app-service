from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.service.api_key import ApiKeyService
from app.schema.api_key import ApiKeyResponse, ApiKeyResetResponse

router = APIRouter(prefix="/api-key", tags=["api-key"])


@router.post(
    "/generate",
    response_model=ApiKeyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="生成 API Key"
)
def generate_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    为当前用户生成 API Key
    如果已存在，则返回现有的 API Key
    """
    api_key = ApiKeyService.create_api_key(db, current_user.id)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="生成 API Key 失败"
        )
    return ApiKeyResponse(api_key=api_key)


@router.post(
    "/reset",
    response_model=ApiKeyResetResponse,
    summary="重置 API Key"
)
def reset_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    重置当前用户的 API Key
    旧的 API Key 将失效
    """
    api_key = ApiKeyService.reset_api_key(db, current_user.id)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="重置 API Key 失败"
        )
    return ApiKeyResetResponse(
        api_key=api_key,
        message="API Key 已重置，旧的 Key 已失效"
    )


@router.get(
    "",
    response_model=ApiKeyResponse,
    summary="获取 API Key"
)
def get_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    获取当前用户的 API Key
    如果不存在则返回 404
    """
    api_key = ApiKeyService.get_api_key(db, current_user.id)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key 不存在，请先生成"
        )
    return ApiKeyResponse(api_key=api_key)
