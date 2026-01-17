from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# ============ 注册 ============
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100, description="用户名")
    password: str = Field(..., min_length=64, max_length=64, description="SHA256 哈希后的密码")
    email: str | None = Field(None, max_length=255, description="邮箱")
    phone: str | None = Field(None, max_length=50, description="手机号")


# ============ 登录 ============
class LoginRequest(BaseModel):
    username: str = Field(..., description="用户名/邮箱/手机号")
    password: str = Field(..., min_length=64, max_length=64, description="SHA256 哈希后的密码")
    client_type: str = Field("web", pattern="^(web|ios|android)$", description="客户端类型")
    device_info: str | None = Field(None, max_length=500, description="设备信息")


# ============ Token ============
class TokenResponse(BaseModel):
    access_token: str = Field(..., description="访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field("Bearer", description="令牌类型")
    expires_in: int = Field(..., description="access_token 过期时间(秒)")


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="刷新令牌")


# ============ 用户信息 ============
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    email: str | None = Field(None, description="邮箱")
    phone: str | None = Field(None, description="手机号")
    is_active: bool = Field(..., description="是否激活")
    is_superuser: bool = Field(..., description="是否超级用户")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


# ============ 登出 ============
class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(None, description="要失效的 refresh_token，不传则失效当前所有")
