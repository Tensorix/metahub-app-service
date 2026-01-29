# IM Gateway 架构设计

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Metahub Server                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    API Layer (FastAPI)                      │ │
│  │                                                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │   WebSocket  │  │  REST API    │  │   Webhook    │     │ │
│  │  │   /im/gateway│  │  /messages/  │  │  /webhooks/  │     │ │
│  │  │              │  │     send     │  │  im/message  │     │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │ │
│  │         │                 │                  │              │ │
│  └─────────┼─────────────────┼──────────────────┼──────────────┘ │
│            │                 │                  │                │
│  ┌─────────▼─────────────────▼──────────────────▼──────────────┐ │
│  │                   Service Layer                              │ │
│  │                                                              │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                │ │
│  │  │ IMConnectionMgr  │  │ WebhookService   │                │ │
│  │  │                  │  │                  │                │ │
│  │  │ - connect()      │  │ - process_im_    │                │ │
│  │  │ - disconnect()   │  │   message()      │                │ │
│  │  │ - send_to_       │  │                  │                │ │
│  │  │   bridge()       │  │                  │                │ │
│  │  │ - resolve_       │  │                  │                │ │
│  │  │   request()      │  │                  │                │ │
│  │  └──────────────────┘  └──────────────────┘                │ │
│  │                                                              │ │
│  └──────────────────────────────────┬───────────────────────────┘ │
│                                     │                             │
│  ┌──────────────────────────────────▼───────────────────────────┐ │
│  │                      Database Layer                          │ │
│  │                                                              │ │
│  │  Session │ Message │ MessagePart │ MessageSender │ Event    │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ WebSocket
                              │
┌─────────────────────────────┴─────────────────────────────────┐
│                      IM Bridge Service                         │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                   Connection Manager                      │ │
│  │                                                           │ │
│  │  - WebSocket client                                       │ │
│  │  - Auto reconnect                                         │ │
│  │  - Heartbeat                                              │ │
│  │  - Message routing                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              ▲                                 │
│                              │                                 │
│  ┌──────────────────────────┴───────────────────────────────┐ │
│  │                    IM Platform SDK                        │ │
│  │                                                           │ │
│  │  QQ Bot │ WeChat Bot │ Telegram Bot │ ...                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## 消息流

### 1. 上行消息流（IM → Metahub）

```
IM Platform
    │
    │ 1. 收到消息
    ▼
IM Platform SDK
    │
    │ 2. 回调
    ▼
IM Bridge Service
    │
    │ 3. 转发 (type: message)
    ▼
WebSocket Connection
    │
    │ 4. 接收
    ▼
IMConnectionManager
    │
    │ 5. 路由
    ▼
WebhookService
    │
    │ 6. 处理
    ▼
Database
    │
    │ 7. 存储
    ▼
Session/Message/Event
```

### 2. 下行消息流（Metahub → IM）

```
REST API Client
    │
    │ 1. POST /messages/send
    ▼
Router (im_gateway.py)
    │
    │ 2. 验证 Session
    ▼
Database
    │
    │ 3. 存储消息 (role=self)
    ▼
IMConnectionManager
    │
    │ 4. send_to_bridge()
    │    - 创建 Future
    │    - 生成 request_id
    ▼
WebSocket Connection
    │
    │ 5. 发送 (type: send_message)
    ▼
IM Bridge Service
    │
    │ 6. 接收指令
    ▼
IM Platform SDK
    │
    │ 7. 投递消息
    ▼
IM Platform
    │
    │ 8. 回报结果
    ▼
IM Bridge Service
    │
    │ 9. 回报 (type: result)
    ▼
WebSocket Connection
    │
    │ 10. 接收结果
    ▼
IMConnectionManager
    │
    │ 11. resolve_request()
    │     - 完成 Future
    ▼
Router
    │
    │ 12. 返回响应
    ▼
REST API Client
```

## 核心组件

### 1. IMConnectionManager

**职责**：
- 管理所有 WebSocket 连接
- 协调请求-响应匹配
- 处理连接生命周期

**关键数据结构**：
```python
_connections: dict[tuple[UUID, str], WebSocket]
# 键: (user_id, source)
# 值: WebSocket 连接

_pending_requests: dict[str, asyncio.Future]
# 键: request_id
# 值: 等待响应的 Future

_request_owners: dict[str, tuple[UUID, str]]
# 键: request_id
# 值: (user_id, source) - 用于清理
```

**关键方法**：
- `connect()`: 注册新连接
- `disconnect()`: 清理连接和资源
- `send_to_bridge()`: 发送消息并等待结果
- `resolve_request()`: 完成 Future

### 2. Router (im_gateway.py)

**职责**：
- WebSocket 端点处理
- REST API 端点处理
- 认证和授权
- 消息路由

**端点**：
- `WS /im/gateway`: WebSocket 连接
- `POST /sessions/{id}/messages/send`: 发送消息
- `GET /im/gateway/status`: 查询状态

### 3. WebhookService

**职责**：
- 处理 IM 消息
- 创建/更新 Session
- 存储 Message
- 触发 Event

**复用**：
- WebSocket 和 Webhook 共享处理逻辑
- 统一的消息格式

## 数据模型

### Session

```python
class Session:
    id: UUID
    user_id: UUID
    title: str
    source: str          # IM 平台标识
    external_id: str     # IM 平台侧的会话 ID
    session_type: str    # pm/group
    created_at: datetime
    updated_at: datetime
```

### Message

```python
class Message:
    id: UUID
    user_id: UUID
    session_id: UUID
    sender_id: UUID
    role: MessageRole    # user/assistant/self
    created_at: datetime
```

### MessagePart

```python
class MessagePart:
    id: UUID
    message_id: UUID
    type: str           # text/image/at/url/json
    content: str
    raw_data: dict
```

## 协议设计

### WebSocket 消息格式

#### Bridge → Server

**转发消息**：
```json
{
  "type": "message",
  "data": {
    "timestamp": 1706000000,
    "session_id": "group_12345",
    "message_id": "msg_001",
    "session_type": "group",
    "source": "astr_qq",
    "sender": {"nickname": "张三", "user_id": "10001"},
    "self_id": "bot_001",
    "message_str": "你好",
    "message": [{"type": "text", "text": "你好"}]
  }
}
```

**回报结果**：
```json
{
  "type": "result",
  "request_id": "uuid",
  "success": true,
  "data": {"message_id": "platform_msg_123"}
}
```

**心跳**：
```json
{"type": "ping"}
```

#### Server → Bridge

**发送消息**：
```json
{
  "type": "send_message",
  "request_id": "uuid",
  "session_id": "group_12345",
  "message": [{"type": "text", "text": "hello"}],
  "message_str": "hello"
}
```

**心跳回复**：
```json
{"type": "pong"}
```

## 并发模型

### WebSocket 连接

```python
# 每个连接独立的协程
async def im_gateway_ws(websocket, source):
    # 主循环
    while True:
        raw = await websocket.receive_json()
        
        if msg_type == "message":
            # 异步处理，不阻塞主循环
            asyncio.create_task(_handle_incoming_message(...))
        
        elif msg_type == "result":
            # 同步处理，立即完成 Future
            im_connection_manager.resolve_request(...)
```

### 消息处理

```python
# 独立的 DB session，不阻塞 WebSocket
async def _handle_incoming_message(data, user_id, source):
    db = SessionLocal()  # 独立 session
    try:
        result = WebhookService.process_im_message(db, ...)
        db.commit()
    finally:
        db.close()
```

### 请求-响应协调

```python
# REST API 等待 WebSocket 响应
async def send_message(...):
    # 1. 存储消息到 DB
    db.add(message)
    db.commit()
    
    # 2. 通过 WebSocket 发送
    bridge_result = await im_connection_manager.send_to_bridge(
        user_id=user_id,
        source=source,
        session_id=external_id,
        message=message,
        timeout=30.0,
    )
    
    # 3. 返回结果
    return SendMessageResponse(...)
```

## 错误处理

### 连接错误

| 错误 | Close Code | 处理 |
|------|------------|------|
| 认证失败 | 4001 | 立即断开 |
| 连接替换 | 4000 | 清理旧连接 |
| 异常断开 | 1006 | 自动重连 |

### 发送错误

| 错误 | HTTP 状态码 | 说明 |
|------|-------------|------|
| Session 不存在 | 404 | 未找到 |
| Session 配置错误 | 400 | 缺少 source/external_id |
| 桥接未连接 | 503 | 服务不可用 |
| 桥接超时 | 504 | 网关超时 |

### 资源清理

```python
# 连接断开时自动清理
async def disconnect(user_id, source):
    key = (user_id, source)
    
    # 1. 移除连接
    self._connections.pop(key, None)
    
    # 2. 取消所有 pending 请求
    for request_id, owner in self._request_owners.items():
        if owner == key:
            future = self._pending_requests.pop(request_id)
            future.set_exception(ConnectionError(...))
```

## 性能优化

### 1. 连接管理

- 使用 dict 存储连接（O(1) 查找）
- 读操作无锁（dict 读取线程安全）
- 写操作加锁（asyncio.Lock）

### 2. 消息处理

- 异步处理，不阻塞主循环
- 独立 DB session，避免锁竞争
- 批量提交（如果需要）

### 3. 内存管理

- 自动清理断开连接
- 超时请求自动清理
- 无内存泄漏

## 安全性

### 1. 认证

- 所有连接必须认证
- 支持 JWT 和 API Key
- Token 通过 query params 传递

### 2. 授权

- 用户只能访问自己的数据
- Session 归属检查
- 连接唯一性保护

### 3. 数据保护

- 消息去重（防止重复处理）
- 事务隔离（独立 DB session）
- 敏感信息不记录日志

## 可扩展性

### 当前限制

- 单服务器部署
- 内存存储连接
- 无消息队列

### 扩展方案

#### 1. 分布式部署

```python
# 使用 Redis 存储连接信息
class DistributedIMConnectionManager:
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def connect(self, user_id, source, server_id):
        # 存储连接到哪个服务器
        await self.redis.hset(
            f"im_connections:{user_id}",
            source,
            server_id
        )
```

#### 2. 消息队列

```python
# 使用 Redis/RabbitMQ 缓冲消息
class MessageQueue:
    async def enqueue(self, user_id, source, message):
        # 桥接断连时缓冲消息
        await self.queue.put((user_id, source, message))
    
    async def dequeue(self, user_id, source):
        # 桥接重连后发送缓冲的消息
        return await self.queue.get((user_id, source))
```

#### 3. 负载均衡

```
                    Load Balancer
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    Server 1         Server 2         Server 3
        │                │                │
        └────────────────┴────────────────┘
                         │
                    Redis Cluster
                    (连接信息)
```

## 监控和运维

### 关键指标

- 活跃连接数
- 消息吞吐量
- 平均延迟
- 错误率
- 超时率

### 日志记录

```python
logger.info(f"IM bridge connected: user_id={user_id}, source={source}")
logger.warning(f"No pending request: {request_id}")
logger.error(f"IM gateway error: {e}", exc_info=True)
```

### 健康检查

```python
# 检查网关状态
GET /api/v1/im/gateway/status

# 响应
{
  "active_connections": [
    {"user_id": "uuid", "source": "astr_qq"}
  ]
}
```

## 总结

IM Gateway 架构设计的核心特点：

1. **简洁**: 清晰的分层架构，职责明确
2. **可靠**: 完善的错误处理和资源管理
3. **高效**: 异步处理，无阻塞
4. **安全**: 认证授权，数据隔离
5. **可扩展**: 易于扩展到分布式部署

适用场景：
- IM 平台消息桥接
- 实时双向通信
- 需要主动推送的场景
- 多租户 SaaS 应用
