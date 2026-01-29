# IM Gateway WebSocket 实现

基于 `docs/im-gateway` 设计文档实现的 IM 桥接 WebSocket 双向通信方案。

## 概述

IM Gateway 提供了一个持久的 WebSocket 连接，使 IM 桥接服务能够：
- **上行**：将 IM 平台消息转发到 Metahub
- **下行**：接收 Metahub 的发送指令，将消息投递到 IM 平台

与现有的 webhook 接口相比，WebSocket 方案支持双向通信，使服务端能够主动向 IM 平台发送消息。

## 架构

```
IM 平台 (QQ/微信/Telegram)
       ↕
IM 桥接服务
       ↕ WebSocket (双向)
Metahub Server
       ↕ REST API
前端 / 其他服务
```

## 实现文件

| 文件 | 说明 |
|------|------|
| `app/service/im_connection.py` | 连接管理器，管理所有 WebSocket 连接 |
| `app/schema/im_gateway.py` | Schema 定义 |
| `app/router/v1/im_gateway.py` | WebSocket 和 REST API 端点 |
| `app/router/v1/__init__.py` | 路由注册 |

## API 端点

### WebSocket 端点

```
ws://host/api/v1/im/gateway?token=<TOKEN>&source=<SOURCE>
```

**参数**：
- `token`: JWT access token 或 API Key (`sk-xxx`)
- `source`: IM 平台标识，如 `astr_qq`, `astr_wechat`

**协议消息**：

Bridge → Server:
- `{"type": "ping"}` - 心跳
- `{"type": "message", "data": {...}}` - 转发 IM 消息
- `{"type": "result", "request_id": "...", "success": true/false, ...}` - 发送结果回报

Server → Bridge:
- `{"type": "pong"}` - 心跳回复
- `{"type": "send_message", "request_id": "...", "session_id": "...", ...}` - 发送消息指令

### REST API 端点

#### 1. 发送消息到 IM 平台

```http
POST /api/v1/sessions/{session_id}/messages/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": [{"type": "text", "text": "hello"}],
  "message_str": "hello"
}
```

**响应**：
```json
{
  "success": true,
  "message_id": "uuid",
  "bridge_result": {"message_id": "platform_msg_123"},
  "error": null
}
```

**错误码**：
- `400`: Session 无 source 或 external_id
- `404`: Session 不存在
- `503`: 桥接未连接
- `504`: 桥接响应超时

#### 2. 查询网关状态

```http
GET /api/v1/im/gateway/status
Authorization: Bearer <token>
```

**响应**：
```json
{
  "active_connections": [
    {"user_id": "uuid", "source": "astr_qq"}
  ]
}
```

## 使用示例

### 1. 桥接服务实现

参考 `examples/im_bridge_example.py`，这是一个完整的桥接服务示例，包含：
- WebSocket 连接和认证
- 自动重连机制
- 心跳保活
- 消息转发和接收
- 错误处理

运行示例：
```bash
# 修改配置
vim examples/im_bridge_example.py
# 设置 API_KEY 和 SOURCE

# 运行
python examples/im_bridge_example.py
```

### 2. 测试脚本

使用 `test_im_gateway.py` 测试 WebSocket 连接和基本功能：

```bash
# 确保服务已启动
python main.py

# 运行测试
python test_im_gateway.py
```

## 关键特性

### 1. 连接管理

- 每个 `(user_id, source)` 只允许一个活跃连接
- 新连接自动替换旧连接（旧连接收到 close code 4000）
- 断开时自动取消所有 pending 请求

### 2. 请求-响应协调

使用 `asyncio.Future` 实现跨协议的请求-响应匹配：
1. REST API 调用 `send_to_bridge()` 创建 Future
2. 通过 WebSocket 发送 `send_message` 指令
3. 桥接回报 `result` 消息
4. `resolve_request()` 完成 Future
5. REST API 返回结果

### 3. 消息处理复用

WebSocket 收到的 IM 消息直接复用 `WebhookService.process_im_message()`，与 webhook 接口共享处理逻辑，零重复代码。

### 4. 认证方式

支持两种认证方式：
- **JWT Token**: 通过 `/api/v1/auth/login` 获取
- **API Key**: 格式 `sk-xxx`，推荐桥接服务使用

### 5. 错误处理

- 认证失败: close code 4001
- 连接替换: close code 4000
- 发送超时: 30 秒（可配置）
- 自动重连: 指数退避策略

## 与 Webhook 的关系

WebSocket 和 Webhook 可以并存：
- **上行消息**：推荐使用 WebSocket（更低延迟），断连时可回退到 Webhook
- **下行消息**：只能通过 WebSocket
- **消息去重**：服务端根据 `message_id` 自动去重

## 开发指南

### 添加新的 IM 平台

1. 实现桥接服务（参考 `examples/im_bridge_example.py`）
2. 设置唯一的 `source` 标识（如 `astr_telegram`）
3. 连接到 WebSocket 端点
4. 实现消息转发和接收逻辑

### 消息格式

转发 IM 消息时，`data` 字段与 `IMMessageWebhookRequest` 完全同构：

```json
{
  "timestamp": 1706000000,
  "session_id": "group_12345",
  "message_id": "msg_001",
  "session_type": "group",
  "source": "astr_qq",
  "sender": {"nickname": "张三", "user_id": "10001"},
  "self_id": "bot_001",
  "message_str": "你好",
  "message": [{"type": "text", "text": "你好"}],
  "group": {"group_id": "12345", "group_name": "测试群"}
}
```

### 调试

启用 DEBUG 模式跳过认证：
```python
# app/config.py
DEBUG = True
```

查看日志：
```bash
# 服务端日志
tail -f logs/app.log

# 或直接运行查看控制台输出
python main.py
```

## 性能考虑

- **并发连接**：单个服务器可支持数千个并发 WebSocket 连接
- **消息处理**：使用独立 DB session，不阻塞 WebSocket 主循环
- **心跳间隔**：建议 30 秒，平衡保活和资源消耗
- **超时设置**：发送消息默认 30 秒超时，可根据 IM 平台特性调整

## 安全性

- **认证**：所有连接必须通过 JWT 或 API Key 认证
- **用户隔离**：每个用户只能访问自己的连接和数据
- **连接唯一性**：防止同一用户的多个桥接实例冲突
- **超时保护**：防止恶意客户端占用资源

## 故障排查

### 连接失败 (4001)
- 检查 token 是否有效
- 确认 API Key 格式正确 (`sk-xxx`)
- 验证用户是否存在

### 发送消息失败 (503)
- 确认桥接服务已连接
- 检查 `source` 是否匹配
- 查看网关状态 API

### 发送消息超时 (504)
- 检查桥接服务是否正常运行
- 确认桥接服务正确回报 `result`
- 增加超时时间（如果 IM 平台响应慢）

### 消息未转发
- 检查 `message_id` 是否重复（会被去重）
- 确认 `session_id` 格式正确
- 查看服务端日志

## 参考文档

详细设计文档位于 `docs/im-gateway/`:
- `00-overview.md` - 架构概览
- `01-connection-manager.md` - 连接管理器设计
- `02-schema.md` - Schema 定义
- `03-router.md` - Router 实现
- `04-register-router.md` - 路由注册
- `05-integration-guide.md` - 接入指南

## 下一步

- [ ] 添加连接统计和监控
- [ ] 实现消息队列缓冲（桥接断连时）
- [ ] 支持批量消息发送
- [ ] 添加消息发送优先级
- [ ] 实现消息撤回功能
