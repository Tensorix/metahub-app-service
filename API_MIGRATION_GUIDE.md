# API 迁移指南：从信封格式到标准 HTTP 状态码

## 概述

本次迁移将 API 响应格式从自定义信封格式改为使用标准 HTTP 状态码。

## 主要变更

### 后端变更

#### 1. 响应格式变更

**之前（信封格式）：**
```json
{
  "code": "200",
  "message": "操作成功",
  "data": { ... }
}
```

**现在（标准格式）：**
```json
{ ... }
```

直接返回数据，使用 HTTP 状态码表示结果：
- `200 OK` - 成功获取/更新
- `201 Created` - 成功创建
- `204 No Content` - 成功删除（无返回内容）
- `400 Bad Request` - 请求参数错误
- `401 Unauthorized` - 未授权
- `404 Not Found` - 资源不存在
- `500 Internal Server Error` - 服务器错误

#### 2. 路由函数签名变更

**之前：**
```python
@router.post("/register", response_model=BaseResponse[UserResponse])
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    return BaseResponse(code="200", message="注册成功", data=user)
```

**现在：**
```python
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    return UserResponse.model_validate(user)
```

#### 3. 删除操作变更

**之前：**
```python
@router.delete("/sessions/{session_id}", response_model=BaseResponse[None])
def delete_session(...):
    return BaseResponse(code="200", message="删除成功")
```

**现在：**
```python
@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(...):
    # 无返回值
    pass
```

### 前端变更

#### 1. API 类型定义变更

**删除：**
```typescript
export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
}
```

#### 2. API 调用变更

**之前：**
```typescript
async login(data: LoginData): Promise<ApiResponse<TokenResponse>> {
  const response = await api.post('/api/v1/auth/login', data);
  return response.data;
}
```

**现在：**
```typescript
async login(data: LoginData): Promise<TokenResponse> {
  const response = await api.post('/api/v1/auth/login', data);
  return response.data;
}
```

#### 3. 状态检查变更

**之前：**
```typescript
const response = await authApi.login({ username, password });
if (response.code === '200') {
  localStorage.setItem('access_token', response.data.access_token);
}
```

**现在：**
```typescript
const tokenResponse = await authApi.login({ username, password });
localStorage.setItem('access_token', tokenResponse.access_token);
```

错误处理通过 try-catch 捕获 HTTP 错误：
```typescript
try {
  const user = await authApi.getMe();
  // 成功处理
} catch (error) {
  // 错误处理（axios 会自动抛出非 2xx 状态码的错误）
}
```

#### 4. 响应拦截器变更

**之前：**
```typescript
if (data.code === '200') {
  localStorage.setItem('access_token', data.data.access_token);
}
```

**现在：**
```typescript
localStorage.setItem('access_token', data.access_token);
```

## 受影响的文件

### 后端
- `app/schema/base.py` - 移除 BaseResponse 和 BaseRequest
- `app/schema/__init__.py` - 移除导出
- `app/router/v1/auth.py` - 更新所有路由
- `app/router/v1/session.py` - 更新所有路由
- `app/router/v1/activity.py` - 更新所有路由
- `app/router/v1/event.py` - 更新所有路由

### 前端
- `frontend/src/lib/api.ts` - 移除 ApiResponse 类型，更新所有 API 方法
- `frontend/src/store/auth.ts` - 更新状态管理逻辑

## 测试建议

1. **后端测试**
   - 验证所有 API 返回正确的 HTTP 状态码
   - 验证成功响应直接返回数据对象
   - 验证错误响应使用 HTTPException

2. **前端测试**
   - 验证登录/注册流程
   - 验证 token 刷新机制
   - 验证错误处理（401、404 等）
   - 验证所有 API 调用不再检查 `code` 字段

## 优势

1. **符合 RESTful 标准** - 使用标准 HTTP 状态码
2. **简化响应结构** - 减少嵌套层级
3. **更好的工具支持** - HTTP 客户端和调试工具能更好地理解标准状态码
4. **减少冗余** - 不需要同时维护业务状态码和 HTTP 状态码
5. **更清晰的错误处理** - 直接使用 HTTP 状态码语义
