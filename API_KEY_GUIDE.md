# API Key 使用指南

## 概述

API Key 是一种用于 API 调用的身份验证方式，格式为 `sk-{随机字符串}`。每个用户可以生成一个唯一的 API Key。

## 功能特性

- **优雅的格式**：`sk-` 前缀 + 32 字符的 URL 安全随机字符串
- **唯一性**：每个用户只能有一个有效的 API Key
- **安全性**：使用 `secrets.token_urlsafe()` 生成高强度随机密钥
- **可重置**：支持重置 API Key，旧密钥立即失效

## API 端点

### 1. 生成 API Key

```http
POST /api/v1/api-key/generate
Authorization: Bearer {access_token}
```

**响应**：
```json
{
  "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**说明**：
- 如果用户已有 API Key，返回现有的
- 如果没有，生成新的 API Key

### 2. 获取 API Key

```http
GET /api/v1/api-key
Authorization: Bearer {access_token}
```

**响应**：
```json
{
  "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**说明**：
- 如果用户没有 API Key，返回 404

### 3. 重置 API Key

```http
POST /api/v1/api-key/reset
Authorization: Bearer {access_token}
```

**响应**：
```json
{
  "api_key": "sk-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
  "message": "API Key 已重置，旧的 Key 已失效"
}
```

**说明**：
- 生成新的 API Key
- 旧的 API Key 立即失效

## 前端使用

### 在设置页面管理 API Key

1. 访问 `/settings` 页面
2. 在 "API Key" 卡片中：
   - 如果没有 API Key，点击"生成 API Key"按钮
   - 如果已有 API Key：
     - 点击眼睛图标显示/隐藏完整密钥
     - 点击复制图标复制到剪贴板
     - 点击刷新图标重置密钥（需确认）

### API 调用示例

```typescript
import { apiKeyApi } from '@/lib/api';

// 生成 API Key
const { api_key } = await apiKeyApi.generate();

// 获取 API Key
const { api_key } = await apiKeyApi.get();

// 重置 API Key
const { api_key, message } = await apiKeyApi.reset();
```

## 使用 API Key 进行身份验证

API Key 可以用于替代 JWT Token 进行 API 调用：

```http
GET /api/v1/some-endpoint
Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

或使用自定义 Header：

```http
GET /api/v1/some-endpoint
X-API-Key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 安全建议

1. **妥善保管**：API Key 具有与密码相同的权限，请勿泄露
2. **定期轮换**：建议定期重置 API Key
3. **限制使用**：仅在必要的场景使用 API Key
4. **监控使用**：关注 API Key 的使用情况，发现异常及时重置

## 数据库结构

```python
class User(Base):
    # ...
    api_key: Mapped[str | None] = mapped_column(
        String(255), 
        unique=True, 
        nullable=True, 
        index=True
    )
```

## 实现细节

### 生成算法

```python
def generate_api_key() -> str:
    random_part = secrets.token_urlsafe(24)  # 生成 32 字符
    return f"sk-{random_part}"
```

### 验证方法

```python
def verify_api_key(db: Session, api_key: str) -> User | None:
    user = db.query(User).filter(
        User.api_key == api_key,
        User.is_active == True
    ).first()
    return user
```

## 迁移说明

数据库迁移文件：`alembic/versions/0d8e7f9c8696_add_api_key_to_user_table.py`

运行迁移：
```bash
alembic upgrade head
```
