# Multi-Source 桥接接入指南

本文档面向需要在**单个 WebSocket 连接中同时对接多个 IM 平台**的桥接服务开发者。

单 source 接入请参考 [05-integration-guide.md](./05-integration-guide.md)。

## 与单 source 模式的区别

| | 单 source | Multi-source |
|---|---|---|
| 连接参数 | `?source=astr_qq` 必传 | 不传 `source` |
| source 声明 | 连接时确定，全程固定 | 连接后通过 `register` 声明，或随消息动态注册 |
| 上行消息 | `data.source` 可省略 | `data.source` **必填** |
| 下行消息 | 服务端按连接的 source 路由 | 服务端按消息所属 session 的 source 路由到同一个 WS |
| 连接数 | 每个平台一个 WS | 所有平台共用一个 WS |

## 1. 建立连接

不传 `source` 参数：

```
ws://<host>/api/v1/im/gateway?token=<TOKEN>
```

连接建立后，服务端尚不知道此桥接支持哪些 source。此时下行消息无法路由到此连接。

## 2. 注册 sources

连接成功后，**立即**发送 `register` 声明支持的 source 列表：

```json
→ {
    "type": "register",
    "sources": ["astr_qq", "astr_wechat", "astr_telegram"]
}
```

服务端回复确认：

```json
← {
    "type": "register_ack",
    "sources": ["astr_qq", "astr_wechat", "astr_telegram"]
}
```

收到 `register_ack` 后，服务端已为这些 source 注册连接，下行消息可以正常路由。

### 注册规则

- 可以多次发送 `register`，新的 sources 会追加注册（不会移除已有的）
- `register_ack.sources` 返回当前连接所有已注册的 source 全集
- `sources` 必须是非空数组，否则返回 `error`
- 每个 `(user, source)` 仍然只允许一个连接——如果另一个 WS 已经注册了 `astr_qq`，旧连接的 `astr_qq` 会被替换

### 动态注册

如果上行消息的 `data.source` 是一个未 register 过的 source，服务端会自动为其注册。但**建议**仍然先 `register`，否则在第一条上行消息到达之前，该 source 的下行消息无法路由。

## 3. 上行消息

每条消息的 `data.source` **必须**指明来源平台：

```json
→ {
    "type": "message",
    "data": {
        "source": "astr_qq",
        "timestamp": 1706000000,
        "session_id": "group_12345",
        "message_id": "msg_001",
        "session_type": "group",
        "sender": {
            "nickname": "张三",
            "user_id": "10001"
        },
        "self_id": "bot_001",
        "message_str": "你好",
        "message": [
            {"type": "text", "text": "你好"}
        ]
    }
}
```

如果缺少 `data.source`，服务端返回错误：

```json
← {
    "type": "error",
    "message": "Missing 'source': provide via query param or in message data.source"
}
```

> `data` 字段格式与单 source 模式完全一致，参考 [05-integration-guide.md § 2.2](./05-integration-guide.md#22-转发-im-消息上行)。

## 4. 下行消息与结果回报

与单 source 模式完全一致。服务端通过 session 记录的 source 找到对应的 WS 连接：

```json
← {
    "type": "send_message",
    "request_id": "550e8400-...",
    "session_id": "group_12345",
    "message": [{"type": "text", "text": "收到"}],
    "message_str": "收到"
}
```

桥接根据 `session_id` 判断投递到哪个 IM 平台，回报结果：

```json
→ {
    "type": "result",
    "request_id": "550e8400-...",
    "success": true,
    "data": {"message_id": "platform_msg_456"}
}
```

> 注意：`send_message` 不包含 `source` 字段。桥接需要自行维护 `session_id → 平台` 的映射关系，或从 session_id 的命名规则中推断。

## 5. 完整生命周期

```
Bridge                                    Server
  |                                         |
  |  WS CONNECT (no source)                 |
  |---------------------------------------->|
  |                                         |
  |  register {sources: [qq, wechat]}       |
  |---------------------------------------->|
  |  register_ack {sources: [qq, wechat]}   |
  |<----------------------------------------|
  |                                         |
  |  message {data: {source: "qq", ...}}    |
  |---------------------------------------->|
  |                                         |
  |  send_message {session_id, ...}         |
  |<----------------------------------------|
  |  result {request_id, success: true}     |
  |---------------------------------------->|
  |                                         |
  |  message {data: {source: "wechat",...}} |
  |---------------------------------------->|
  |                                         |
  |  ping                                   |
  |---------------------------------------->|
  |  pong                                   |
  |<----------------------------------------|
  |                                         |
  |  WS DISCONNECT                          |
  |----X                                    |
  |         (server cleans up qq + wechat)  |
```

## 6. 参考实现

```python
import asyncio
import json
import websockets
from websockets.exceptions import ConnectionClosed


API_URL = "ws://localhost:8000/api/v1/im/gateway"
API_KEY = "sk-your-api-key"
SOURCES = ["astr_qq", "astr_wechat"]

RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 60
HEARTBEAT_INTERVAL = 30


class MultiSourceBridge:
    def __init__(self, sources: list[str]):
        self.sources = sources
        self.ws = None
        self._reconnect_delay = RECONNECT_DELAY

    async def connect(self):
        """带重连的连接管理"""
        while True:
            try:
                url = f"{API_URL}?token={API_KEY}"
                async with websockets.connect(url) as ws:
                    self.ws = ws
                    self._reconnect_delay = RECONNECT_DELAY
                    print("Connected to Metahub (multi-source)")

                    # 注册 sources
                    await self._register()

                    await asyncio.gather(
                        self._heartbeat_loop(),
                        self._receive_loop(),
                    )

            except (ConnectionClosed, ConnectionError, OSError) as e:
                print(f"Connection lost: {e}")
                self.ws = None
                print(f"Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(
                    self._reconnect_delay * 2, MAX_RECONNECT_DELAY
                )

    async def _register(self):
        """注册支持的 sources"""
        await self.ws.send(json.dumps({
            "type": "register",
            "sources": self.sources,
        }))
        # 等待 register_ack
        raw = await self.ws.recv()
        ack = json.loads(raw)
        if ack.get("type") == "register_ack":
            print(f"Registered sources: {ack['sources']}")
        else:
            print(f"Unexpected response: {ack}")

    async def _heartbeat_loop(self):
        while self.ws:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await self.ws.send(json.dumps({"type": "ping"}))

    async def _receive_loop(self):
        async for raw in self.ws:
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "send_message":
                asyncio.create_task(self._handle_send(data))
            elif msg_type == "pong":
                pass

    async def _handle_send(self, data: dict):
        """处理发送指令 — 根据 session_id 判断投递到哪个平台"""
        request_id = data["request_id"]
        session_id = data["session_id"]
        message_str = data["message_str"]

        try:
            # === 根据 session_id 路由到对应的 IM 平台 SDK ===
            # platform = self.resolve_platform(session_id)
            # await platform.send(session_id, message_str)
            print(f"Sending to {session_id}: {message_str}")

            await self.ws.send(json.dumps({
                "type": "result",
                "request_id": request_id,
                "success": True,
                "data": {},
            }))
        except Exception as e:
            await self.ws.send(json.dumps({
                "type": "result",
                "request_id": request_id,
                "success": False,
                "error": str(e),
            }))

    async def forward_message(self, source: str, message_data: dict):
        """供 IM 平台回调使用：转发消息到 Metahub（必须带 source）"""
        if not self.ws:
            return
        message_data["source"] = source
        await self.ws.send(json.dumps({
            "type": "message",
            "data": message_data,
        }))


if __name__ == "__main__":
    bridge = MultiSourceBridge(SOURCES)
    asyncio.run(bridge.connect())
```

## 7. 注意事项

### register 时机

连接建立后应**立即** register。在 register 之前，服务端无法将下行消息路由到此连接。

### 下行消息的平台路由

`send_message` 不携带 `source`，只有 `session_id`。桥接需要自行判断这个 session 属于哪个 IM 平台。常见做法：
- session_id 带平台前缀：`qq_group_12345`、`wechat_room_678`
- 桥接自行维护 `session_id → source` 映射表

### 断线重连

断线后所有已注册的 source 会被服务端清除。重连后必须重新 `register`。

### 与单 source 连接共存

multi-source 连接和单 source 连接可以共存。如果 multi-source 连接 register 了 `astr_qq`，而另一个单 source 连接也使用 `source=astr_qq`，**后连接的**会替换先连接的（被替换方收到 close code 4000）。
