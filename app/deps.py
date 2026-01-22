from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.service.auth import TokenService, AuthService
from app.service.api_key import ApiKeyService
from app.config import config

security = HTTPBearer(auto_error=False)

# DEBUG 模式下使用的固定用户
DEBUG_USER = User(
    id=UUID("00000000-0000-0000-0000-000000000000"),
    username="debug_user",
    email="debug@example.com",
    phone=None,
    password_hash="",
    is_active=True,
    is_superuser=True,
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """获取当前登录用户，DEBUG 模式下返回固定的 debug 用户"""
    
    # DEBUG 模式下返回固定的 debug 用户
    if config.DEBUG:
        return DEBUG_USER
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少认证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = TokenService.decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 token 类型",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = AuthService.get_user_by_id(db, UUID(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的用户 ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_user_flexible(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """
    灵活认证：支持 JWT Token 和 API Key
    - 如果 token 以 'sk-' 开头，则作为 API Key 验证
    - 否则作为 JWT Token 验证
    """
    # DEBUG 模式下返回固定的 debug 用户
    if config.DEBUG:
        return DEBUG_USER
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少认证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    # 判断是 API Key 还是 JWT Token
    if token.startswith("sk-"):
        # API Key 认证
        user = ApiKeyService.verify_api_key(db, token)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的 API Key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user
    else:
        # JWT Token 认证
        payload = TokenService.decode_token(token)
        
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的认证凭据",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的 token 类型",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的 token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        try:
            user = AuthService.get_user_by_id(db, UUID(user_id))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的用户 ID",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在或已禁用",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user


def get_current_active_superuser(
    current_user: User | None = Depends(get_current_user),
) -> User | None:
    """获取当前超级用户，DEBUG 模式下返回 debug 用户"""
    
    # DEBUG 模式下返回 debug 用户
    if config.DEBUG:
        return DEBUG_USER
    
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未认证",
        )
    
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足",
        )
    return current_user
