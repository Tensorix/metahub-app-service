# IM Gateway WebSocket - 架构概览

## 背景

现有 webhook 接口（`POST /api/v1/webhooks/im/message`）仅支持单向消息接收。IM 桥接服务将消息推送到服务端，服务端无法主动向 IM 平台发送消息。

IM Gateway WebSocket 接口在保留 webhook 的基础上，新增持久双向通道，使服务端能够：
- 接收 IM 消息（与 webhook 相同的处理逻辑）
- 向 IM 平台发送消息（回复、主动推送）

## 架构

```
                          ┌─────────────────────────────────────┐
                          │          Metahub Server              │
                          │                                     │
  IM Bridge (astr_qq)     │  ┌───────────┐   ┌──────────────┐  │
  ┌──────────────┐        │  │ IM Gateway │   │   Webhook    │  │
  │              │◄──WS──►│  │  Router    │   │   Router     │  │
  │  QQ Bot      │        │  └─────┬─────┘   └──────┬───────┘  │
  └──────────────┘        │        │                 │          │
                          │        ▼                 ▼          │
  IM Bridge (astr_wechat) │  ┌─────────────────────────────┐   │
  ┌──────────────┐        │  │     WebhookService           │   │
  │              │◄──WS──►│  │  (共享消息处理逻辑)            │   │
  │  WeChat Bot  │        │  └─────────────┬───────────────┘   │
  └──────────────┘        │                │                    │
                          │                ▼                    │
  前端 / 其他服务          │  ┌─────────────────────────────┐   │
  ┌──────────────┐        │  │     Database                 │   │
  │              │──REST─►│  │  Session, Message, Event...  │   │
  │  Web App     │        │  └─────────────────────────────┘   │
  └──────────────┘        │                                     │
                          └─────────────────────────────────────┘
```

## API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| WS | `/api/v1/im/gateway?token=xxx&source=astr_qq` | 桥接服务 WebSocket 连接 |
| POST | `/api/v1/sessions/{session_id}/messages/send` | 通过桥接发送消息到 IM 平台 |
| GET | `/api/v1/im/gateway/status` | 查看活跃连接状态 |

## WebSocket 协议

### Bridge → Server

| type | 说明 | 触发时机 |
|------|------|----------|
| `message` | 转发 IM 消息 | 桥接收到 IM 平台消息 |
| `result` | 发送消息的结果 | 桥接完成消息投递 |
| `ping` | 心跳 | 定期保活 |

### Server → Bridge

| type | 说明 | 触发时机 |
|------|------|----------|
| `send_message` | 请求发送消息 | REST API 或系统内部触发 |
| `pong` | 心跳回复 | 收到 ping |

## 消息发送流程

```
用户/系统                REST API              ConnectionManager         IM Bridge
   │                      │                         │                      │
   │── POST /send ──────►│                         │                      │
   │                      │── 存 DB (role=self) ──►│                      │
   │                      │── send_to_bridge() ───►│                      │
   │                      │                         │── send_message ────►│
   │                      │                         │                      │── 投递到 IM
   │                      │                         │◄── result ──────────│
   │                      │◄── bridge_result ──────│                      │
   │◄── 200 OK ──────────│                         │                      │
```

## 文件清单

| 文件 | 操作 | 文档 |
|------|------|------|
| `app/service/im_connection.py` | 新建 | [01-connection-manager.md](01-connection-manager.md) |
| `app/schema/im_gateway.py` | 新建 | [02-schema.md](02-schema.md) |
| `app/router/v1/im_gateway.py` | 新建 | [03-router.md](03-router.md) |
| `app/router/v1/__init__.py` | 修改 | [04-register-router.md](04-register-router.md) |
| *(外部)* IM 平台接入指南 | 参考 | [05-integration-guide.md](05-integration-guide.md) |
