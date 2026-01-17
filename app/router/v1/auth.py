from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.service.auth import AuthService
from app.schema.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    UserResponse,
    LogoutRequest,
)
from app.schema.base import BaseResponse
from app.config import config

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=BaseResponse[UserResponse], summary="用户注册")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    user = AuthService.register(db, data)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名、邮箱或手机号已存在",
        )
    return BaseResponse(
        code="200",
        message="注册成功",
        data=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=BaseResponse[TokenResponse], summary="用户登录")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = AuthService.authenticate(db, data.username, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    access_token, refresh_token = AuthService.create_tokens(
        db, user, data.client_type, data.device_info
    )

    return BaseResponse(
        code="200",
        message="登录成功",
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        ),
    )


@router.post("/refresh", response_model=BaseResponse[TokenResponse], summary="刷新令牌")
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    result = AuthService.refresh_access_token(db, data.refresh_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已过期的 refresh_token",
        )

    access_token, refresh_token = result
    return BaseResponse(
        code="200",
        message="刷新成功",
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        ),
    )


@router.post("/logout", response_model=BaseResponse[None], summary="用户登出")
def logout(
    data: LogoutRequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    refresh_token = data.refresh_token if data else None
    AuthService.logout(db, current_user.id, refresh_token)
    return BaseResponse(code="200", message="登出成功")


@router.get("/me", response_model=BaseResponse[UserResponse], summary="获取当前用户信息")
def get_me(current_user: User = Depends(get_current_user)):
    return BaseResponse(
        code="200",
        message="获取成功",
        data=UserResponse.model_validate(current_user),
    )
