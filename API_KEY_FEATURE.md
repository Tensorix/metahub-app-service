# ✨ API Key 功能

## 简介

为系统添加了优雅的 API Key 生成和管理功能。用户可以在设置页面轻松生成、查看、复制和重置自己的 API Key。

## 🎯 核心功能

### 优雅的密钥格式
- 格式：`sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- 使用密码学安全的随机数生成器
- 32 字符长度，URL 安全

### 完整的管理界面
- 🔑 **生成**：一键生成 API Key
- 👁️ **显示/隐藏**：保护密钥隐私
- 📋 **复制**：一键复制到剪贴板
- 🔄 **重置**：生成新密钥（旧密钥立即失效）

### 安全保障
- 数据库唯一索引
- 必须登录才能管理
- 重置时旧密钥立即失效

## 📸 界面预览

### 设置页面

```
┌────────────────────────────────────────────────┐
│ 🔑 API Key                                     │
│ 用于 API 调用的密钥，请妥善保管                  │
├────────────────────────────────────────────────┤
│ 您的 API Key                                   │
│ ┌──────────────────────────────┐              │
│ │ sk-abc123************  [👁️]  │ [📋] [🔄]    │
│ └──────────────────────────────┘              │
│                                                │
│ ⚠️ 重置 API Key 将使旧的 Key 立即失效          │
└────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 1. 运行数据库迁移
```bash
alembic upgrade head
```

### 2. 启动服务
```bash
# 后端
uvicorn main:app --reload

# 前端
cd frontend && npm run dev
```

### 3. 使用功能
1. 登录系统
2. 进入"设置"页面
3. 点击"生成 API Key"
4. 复制并保存你的密钥

## 📚 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/api-key/generate` | 生成 API Key |
| GET  | `/api/v1/api-key` | 获取 API Key |
| POST | `/api/v1/api-key/reset` | 重置 API Key |

## 💻 代码示例

### 前端使用
```typescript
import { apiKeyApi } from '@/lib/api';

// 生成 API Key
const { api_key } = await apiKeyApi.generate();

// 获取 API Key
const { api_key } = await apiKeyApi.get();

// 重置 API Key
const { api_key, message } = await apiKeyApi.reset();
```

### 后端使用
```python
from app.service.api_key import ApiKeyService

# 生成 API Key
api_key = ApiKeyService.create_api_key(db, user_id)

# 验证 API Key
user = ApiKeyService.verify_api_key(db, api_key)
```

### cURL 示例
```bash
# 生成 API Key
curl -X POST http://localhost:8000/api/v1/api-key/generate \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取 API Key
curl -X GET http://localhost:8000/api/v1/api-key \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📁 文件结构

### 后端
```
app/
├── db/model/user.py              # 添加 api_key 字段
├── schema/api_key.py             # API Key Schema
├── service/api_key.py            # 业务逻辑
└── router/v1/api_key.py          # API 路由
```

### 前端
```
frontend/src/
├── pages/Settings.tsx            # 设置页面
├── lib/api.ts                    # API 调用
├── hooks/use-toast.ts            # Toast 通知
└── components/ui/toaster.tsx     # Toast 组件
```

## 📖 完整文档

- [API_KEY_QUICKSTART.md](./API_KEY_QUICKSTART.md) - 5 分钟快速上手
- [API_KEY_GUIDE.md](./API_KEY_GUIDE.md) - 完整使用指南
- [API_KEY_USAGE_EXAMPLE.md](./API_KEY_USAGE_EXAMPLE.md) - 代码示例
- [API_KEY_ARCHITECTURE.md](./API_KEY_ARCHITECTURE.md) - 架构设计
- [API_KEY_SUMMARY.md](./API_KEY_SUMMARY.md) - 实现总结

## 🧪 测试

运行测试脚本：
```bash
python test_api_key.py
```

测试覆盖：
- ✓ 用户注册和登录
- ✓ API Key 生成
- ✓ API Key 格式验证
- ✓ API Key 获取
- ✓ API Key 重置
- ✓ 用户信息包含 API Key

## 🔒 安全建议

1. **妥善保管**：API Key 具有与密码相同的权限
2. **定期轮换**：建议每 90 天重置一次
3. **环境变量**：使用环境变量存储，不要硬编码
4. **监控使用**：记录 API Key 使用日志

## 🎉 特性亮点

- ✅ 优雅的密钥格式（`sk-` 前缀）
- ✅ 密码学安全的随机数生成
- ✅ 友好的前端管理界面
- ✅ 完整的 CRUD 操作
- ✅ Toast 通知反馈
- ✅ 显示/隐藏密钥
- ✅ 一键复制功能
- ✅ 数据库唯一约束
- ✅ 完整的文档和测试

## 🔮 未来扩展

- [ ] API Key 权限范围（scopes）
- [ ] 支持多个 API Key
- [ ] 使用统计和监控
- [ ] 速率限制
- [ ] 过期时间设置

## 📞 支持

如有问题，请查看：
- 完整文档：[API_KEY_GUIDE.md](./API_KEY_GUIDE.md)
- 快速开始：[API_KEY_QUICKSTART.md](./API_KEY_QUICKSTART.md)
- 测试脚本：[test_api_key.py](./test_api_key.py)
