# IM Gateway 快速启动指南

## 1. 安装依赖

```bash
# 安装新增的依赖
uv sync
# 或
pip install websockets httpx
```

## 2. 启动服务

```bash
# 启动 Metahub 服务
python main.py
```

服务将在 `http://localhost:8000` 启动。

## 3. 创建测试用户（如果还没有）

```bash
# 使用 API 创建用户
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "password": "test_password",
    "email": "test@example.com"
  }'
```

## 4. 测试 WebSocket 连接

### 方式 1: 使用测试脚本

```bash
# 修改测试脚本中的用户名密码
vim test_im_gateway.py

# 运行测试
python test_im_gateway.py
```

### 方式 2: 使用桥接示例

```bash
# 1. 获取 API Key
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test_user", "password": "test_password"}'

# 2. 创建 API Key（可选，推荐）
curl -X POST http://localhost:8000/api/v1/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "IM Bridge Key"}'

# 3. 修改桥接示例配置
vim examples/im_bridge_example.py
# 设置 API_KEY 和 SOURCE

# 4. 运行桥接服务
python examples/im_bridge_example.py
```

## 5. 查看网关状态

```bash
# 获取 token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test_user", "password": "test_password"}' \
  | jq -r '.access_token')

# 查看活跃连接
curl -X GET http://localhost:8000/api/v1/im/gateway/status \
  -H "Authorization: Bearer $TOKEN"
```

## 6. 测试发送消息

```bash
# 1. 创建一个 Session（如果还没有）
SESSION_ID=$(curl -X POST http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试会话",
    "source": "test_bot",
    "external_id": "test_group_001"
  }' | jq -r '.id')

# 2. 确保桥接服务正在运行（见步骤 4）

# 3. 发送消息
curl -X POST "http://localhost:8000/api/v1/sessions/$SESSION_ID/messages/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": [{"type": "text", "text": "测试消息"}],
    "message_str": "测试消息"
  }'
```

## 7. 查看 API 文档

访问 Swagger UI 查看完整的 API 文档：

```
http://localhost:8000/docs
```

在 "im-gateway" 标签下可以看到所有 IM Gateway 相关的端点。

## 常见问题

### Q: WebSocket 连接失败 (4001)

**A**: 检查认证信息：
- JWT token 是否有效（未过期）
- API Key 格式是否正确（`sk-xxx`）
- 用户是否存在

### Q: 发送消息返回 503

**A**: 桥接服务未连接：
- 确认桥接服务正在运行
- 检查 `source` 参数是否匹配
- 查看网关状态 API 确认连接

### Q: 发送消息返回 404

**A**: Session 不存在：
- 确认 Session ID 正确
- 检查 Session 是否属于当前用户
- 确认 Session 未被删除

### Q: 发送消息返回 400

**A**: Session 配置不完整：
- 确认 Session 有 `source` 字段
- 确认 Session 有 `external_id` 字段

### Q: 消息未转发到服务端

**A**: 检查消息格式：
- 确认 `message_id` 不重复（会被去重）
- 检查必填字段是否完整
- 查看服务端日志

## 下一步

- 阅读 [IM_GATEWAY_README.md](IM_GATEWAY_README.md) 了解详细信息
- 查看 [docs/im-gateway/](docs/im-gateway/) 了解设计文档
- 参考 [examples/im_bridge_example.py](examples/im_bridge_example.py) 实现自己的桥接服务

## 开发模式

如果需要跳过认证进行测试，可以启用 DEBUG 模式：

```bash
# .env
DEBUG=true
```

**警告**: 仅在开发环境使用，生产环境必须关闭！
