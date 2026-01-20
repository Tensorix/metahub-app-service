# API Key 快速开始

## 🚀 5 分钟快速上手

### 1️⃣ 运行数据库迁移

```bash
alembic upgrade head
```

### 2️⃣ 启动后端服务

```bash
# 开发环境
uvicorn main:app --reload

# 或使用 Docker
docker-compose up -d
```

### 3️⃣ 启动前端服务

```bash
cd frontend
npm install  # 首次运行
npm run dev
```

### 4️⃣ 使用 API Key

1. 访问 http://localhost:5173
2. 登录或注册账户
3. 进入"设置"页面
4. 点击"生成 API Key"
5. 复制并保存你的 API Key

### 5️⃣ 测试 API Key

```bash
# 运行测试脚本
python test_api_key.py
```

## 📱 前端界面预览

### 设置页面 - API Key 管理

```
┌─────────────────────────────────────────┐
│ 🔑 API Key                              │
│ 用于 API 调用的密钥，请妥善保管          │
├─────────────────────────────────────────┤
│                                         │
│ 您的 API Key                            │
│ ┌─────────────────────────────────┐    │
│ │ sk-abc123*************** [👁] │ [📋] [🔄] │
│ └─────────────────────────────────┘    │
│                                         │
│ ⚠️ 重置 API Key 将使旧的 Key 立即失效   │
└─────────────────────────────────────────┘
```

## 🔧 API 端点

```bash
# 生成 API Key
curl -X POST http://localhost:8000/api/v1/api-key/generate \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取 API Key
curl -X GET http://localhost:8000/api/v1/api-key \
  -H "Authorization: Bearer YOUR_TOKEN"

# 重置 API Key
curl -X POST http://localhost:8000/api/v1/api-key/reset \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 💡 使用示例

### TypeScript/React

```typescript
import { apiKeyApi } from '@/lib/api';

// 生成 API Key
const { api_key } = await apiKeyApi.generate();
console.log('API Key:', api_key);

// 使用 API Key 调用其他 API
const response = await fetch('/api/v1/some-endpoint', {
  headers: {
    'Authorization': `Bearer ${api_key}`
  }
});
```

### Python

```python
import requests

# 生成 API Key
response = requests.post(
    'http://localhost:8000/api/v1/api-key/generate',
    headers={'Authorization': f'Bearer {access_token}'}
)
api_key = response.json()['api_key']

# 使用 API Key
response = requests.get(
    'http://localhost:8000/api/v1/some-endpoint',
    headers={'Authorization': f'Bearer {api_key}'}
)
```

## 📚 更多文档

- [API_KEY_GUIDE.md](./API_KEY_GUIDE.md) - 完整功能指南
- [API_KEY_USAGE_EXAMPLE.md](./API_KEY_USAGE_EXAMPLE.md) - 详细代码示例
- [API_KEY_SUMMARY.md](./API_KEY_SUMMARY.md) - 实现总结

## ❓ 常见问题

**Q: API Key 的格式是什么？**  
A: `sk-` 前缀 + 32 字符的 URL 安全随机字符串

**Q: 可以有多个 API Key 吗？**  
A: 目前每个用户只能有一个 API Key

**Q: 重置 API Key 后旧的还能用吗？**  
A: 不能，重置后旧的 Key 立即失效

**Q: API Key 存储在哪里？**  
A: 存储在数据库的 `user` 表的 `api_key` 字段中

**Q: 如何保护 API Key？**  
A: 使用环境变量存储，不要提交到代码仓库，定期轮换

## 🎉 完成！

现在你已经可以使用 API Key 功能了！
