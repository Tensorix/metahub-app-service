# API Key 架构设计

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Settings.tsx (设置页面)                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │ 生成按钮    │  │ 显示/隐藏  │  │ 复制/重置   │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  api.ts (API 调用层)                                  │  │
│  │  - apiKeyApi.generate()                              │  │
│  │  - apiKeyApi.get()                                   │  │
│  │  - apiKeyApi.reset()                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓ HTTP
┌─────────────────────────────────────────────────────────────┐
│                         后端层                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  router/v1/api_key.py (路由层)                        │  │
│  │  - POST /api/v1/api-key/generate                     │  │
│  │  - GET  /api/v1/api-key                              │  │
│  │  - POST /api/v1/api-key/reset                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  service/api_key.py (业务逻辑层)                      │  │
│  │  - generate_api_key()      生成随机密钥              │  │
│  │  - create_api_key()        创建或返回现有             │  │
│  │  - reset_api_key()         重置密钥                  │  │
│  │  - get_api_key()           获取密钥                  │  │
│  │  - verify_api_key()        验证密钥                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  db/model/user.py (数据模型层)                        │  │
│  │  User.api_key: str | None                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                       数据库层                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL                                          │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │ user 表                                         │ │  │
│  │  │ - id: UUID (PK)                                │ │  │
│  │  │ - username: VARCHAR(100) UNIQUE                │ │  │
│  │  │ - api_key: VARCHAR(255) UNIQUE INDEX           │ │  │
│  │  │ - ...                                          │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 数据流程

### 1. 生成 API Key 流程

```
用户点击"生成 API Key"
    ↓
前端调用 apiKeyApi.generate()
    ↓
POST /api/v1/api-key/generate
    ↓
验证用户身份 (JWT Token)
    ↓
ApiKeyService.create_api_key(db, user_id)
    ↓
检查用户是否已有 API Key
    ├─ 有 → 返回现有 API Key
    └─ 无 → 生成新 API Key
           ↓
       secrets.token_urlsafe(24)
           ↓
       格式化为 "sk-{random}"
           ↓
       保存到数据库
           ↓
       返回 API Key
    ↓
前端显示 API Key
```

### 2. 重置 API Key 流程

```
用户点击"重置"并确认
    ↓
前端调用 apiKeyApi.reset()
    ↓
POST /api/v1/api-key/reset
    ↓
验证用户身份
    ↓
ApiKeyService.reset_api_key(db, user_id)
    ↓
生成新的 API Key
    ↓
更新数据库 (旧 Key 被覆盖)
    ↓
返回新 API Key + 提示消息
    ↓
前端显示新 API Key 和 Toast 通知
```

### 3. 验证 API Key 流程

```
客户端使用 API Key 调用 API
    ↓
Authorization: Bearer sk-xxx
    ↓
ApiKeyService.verify_api_key(db, api_key)
    ↓
查询数据库
    ↓
SELECT * FROM user WHERE api_key = ? AND is_active = true
    ↓
    ├─ 找到用户 → 返回 User 对象
    └─ 未找到 → 返回 None (401 Unauthorized)
```

## 🔐 安全设计

### 1. 密钥生成

```python
import secrets

def generate_api_key() -> str:
    # 使用密码学安全的随机数生成器
    random_part = secrets.token_urlsafe(24)  # 生成 32 字符
    return f"sk-{random_part}"
```

**特点**：
- 使用 `secrets` 模块（密码学安全）
- URL 安全的 base64 编码
- 足够的熵（24 字节 = 192 位）

### 2. 数据库约束

```sql
CREATE TABLE user (
    id UUID PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    api_key VARCHAR(255) UNIQUE,  -- 唯一约束
    ...
);

CREATE UNIQUE INDEX ix_user_api_key ON user (api_key);  -- 唯一索引
```

**保证**：
- 每个 API Key 全局唯一
- 快速查询性能（索引）
- 防止重复密钥

### 3. 访问控制

```python
@router.post("/api-key/generate")
def generate_api_key(
    current_user: User = Depends(get_current_user),  # 必须登录
    db: Session = Depends(get_db)
):
    # 只能为当前用户生成 API Key
    api_key = ApiKeyService.create_api_key(db, current_user.id)
    return {"api_key": api_key}
```

**保证**：
- 必须通过 JWT 认证
- 只能管理自己的 API Key
- 无法访问他人的 API Key

## 📊 数据模型

### User 模型

```python
class User(Base):
    __tablename__ = "user"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid7)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    
    # API Key 字段
    api_key: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,      # 全局唯一
        nullable=True,    # 可选字段
        index=True        # 建立索引
    )
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

### Schema 定义

```python
# 响应 Schema
class ApiKeyResponse(BaseModel):
    api_key: str

class ApiKeyResetResponse(BaseModel):
    api_key: str
    message: str

# 用户信息 Schema (包含 API Key)
class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str | None
    api_key: str | None  # 新增字段
    # ...
```

## 🎯 设计原则

### 1. 单一职责

- **Service 层**：业务逻辑（生成、验证、重置）
- **Router 层**：HTTP 请求处理
- **Model 层**：数据持久化

### 2. 安全优先

- 使用密码学安全的随机数生成器
- 数据库唯一约束
- 必须通过身份验证才能访问

### 3. 用户友好

- 优雅的密钥格式（`sk-` 前缀）
- 前端支持显示/隐藏
- 一键复制功能
- Toast 通知反馈

### 4. 可扩展性

- 预留权限范围扩展（未来可添加 scopes）
- 支持多种认证方式（JWT + API Key）
- 易于添加使用统计和监控

## 🔮 未来扩展

### 1. API Key 权限范围

```python
class ApiKey(Base):
    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("user.id"))
    key: Mapped[str] = mapped_column(String(255), unique=True)
    scopes: Mapped[list[str]] = mapped_column(JSON)  # ["read", "write"]
    expires_at: Mapped[datetime | None]
```

### 2. 多个 API Key

```python
# 用户可以创建多个 API Key，每个有不同用途
class ApiKey(Base):
    name: Mapped[str]  # "Production Key", "Development Key"
    last_used_at: Mapped[datetime | None]
```

### 3. 使用统计

```python
class ApiKeyUsage(Base):
    api_key_id: Mapped[UUID]
    endpoint: Mapped[str]
    timestamp: Mapped[datetime]
    ip_address: Mapped[str]
```

### 4. 速率限制

```python
@router.get("/some-endpoint")
@rate_limit(max_requests=100, window=60)  # 每分钟 100 次
def some_endpoint(api_key: str = Depends(verify_api_key)):
    pass
```

## 📈 性能考虑

### 1. 数据库索引

```sql
CREATE UNIQUE INDEX ix_user_api_key ON user (api_key);
```

- 查询时间：O(log n)
- 支持快速验证

### 2. 缓存策略（未来）

```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def verify_api_key_cached(api_key: str) -> User | None:
    return ApiKeyService.verify_api_key(db, api_key)
```

### 3. 连接池

- SQLAlchemy 自动管理数据库连接池
- 减少连接开销

## ✅ 测试覆盖

- ✓ 单元测试：Service 层逻辑
- ✓ 集成测试：API 端点
- ✓ E2E 测试：前端交互
- ✓ 安全测试：权限验证

## 📝 总结

这个 API Key 系统设计：
- **安全**：密码学安全的随机数生成
- **简洁**：清晰的分层架构
- **易用**：友好的前端界面
- **可靠**：完整的错误处理
- **可扩展**：预留扩展空间
