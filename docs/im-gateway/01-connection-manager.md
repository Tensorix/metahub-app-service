# Step 1: ConnectionManager 连接管理器

**文件**: `app/service/im_connection.py`（新建）

## 职责

管理所有 IM 桥接服务的 WebSocket 连接，协调发送消息时的请求-响应匹配。

## 核心设计

连接以 `(user_id, source)` 为键。每个用户的每个 IM 平台最多一个活跃连接。

发送消息时，使用 `asyncio.Future` 实现跨协议的请求-响应协调：
1. REST API 调用 `send_to_bridge()` 生成 `request_id`，创建 Future，通过 WS 发送
2. WS 收到桥接的 `result` 消息，调用 `resolve_request()` 完成 Future
3. REST API 从 Future 获取结果并返回

```
REST Handler                 ConnectionManager              WS Receive Loop
     │                              │                              │
     │── send_to_bridge() ────────►│                              │
     │                              │── Future = loop.create_future()
     │                              │── ws.send_json(send_message) │
     │                              │                              │
     │   (await future)             │                  (bridge 处理) │
     │                              │                              │
     │                              │◄──── resolve_request() ──────│
     │                              │── future.set_result(data)    │
     │◄── result ──────────────────│                              │
```

## 实现

```python
"""IM Gateway 连接管理器"""
import asyncio
from uuid import UUID, uuid4

from fastapi import WebSocket
from loguru import logger


class IMConnectionManager:
    """
    管理 IM 桥接服务的 WebSocket 连接。

    连接键: (user_id, source) - 如 (uuid, "astr_qq")
    每个键最多一个活跃连接，新连接会替换旧连接。
    """

    def __init__(self) -> None:
        self._connections: dict[tuple[UUID, str], WebSocket] = {}
        self._pending_requests: dict[str, asyncio.Future] = {}
        self._request_owners: dict[str, tuple[UUID, str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: UUID, source: str, websocket: WebSocket) -> None:
        """注册连接。若已存在同 key 连接，关闭旧连接后替换。"""
        async with self._lock:
            key = (user_id, source)
            old_ws = self._connections.get(key)
            if old_ws is not None:
                logger.warning(f"Replacing existing connection for {key}")
                try:
                    await old_ws.close(code=4000, reason="Replaced by new connection")
                except Exception:
                    pass
            self._connections[key] = websocket
            logger.info(f"IM bridge connected: user_id={user_id}, source={source}")

    async def disconnect(self, user_id: UUID, source: str) -> None:
        """移除连接并取消所有该连接的 pending 请求。"""
        async with self._lock:
            key = (user_id, source)
            self._connections.pop(key, None)
            # 取消该连接所有 pending 的 Future
            to_remove = [
                rid for rid, owner in self._request_owners.items() if owner == key
            ]
            for rid in to_remove:
                future = self._pending_requests.pop(rid, None)
                self._request_owners.pop(rid, None)
                if future and not future.done():
                    future.set_exception(
                        ConnectionError(f"Bridge disconnected: {source}")
                    )
            logger.info(f"IM bridge disconnected: user_id={user_id}, source={source}")

    def get_connection(self, user_id: UUID, source: str) -> WebSocket | None:
        """获取活跃连接。"""
        return self._connections.get((user_id, source))

    def is_connected(self, user_id: UUID, source: str) -> bool:
        """检查桥接是否在线。"""
        return (user_id, source) in self._connections

    async def send_to_bridge(
        self,
        user_id: UUID,
        source: str,
        session_id: str,
        message: list[dict],
        message_str: str,
        timeout: float = 30.0,
    ) -> dict:
        """
        通过 WebSocket 向桥接发送消息并等待投递结果。

        Raises:
            ConnectionError: 无活跃连接
            TimeoutError: 桥接未在 timeout 内响应
        """
        ws = self.get_connection(user_id, source)
        if ws is None:
            raise ConnectionError(f"No active connection for source={source}")

        request_id = str(uuid4())
        key = (user_id, source)

        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict] = loop.create_future()
        self._pending_requests[request_id] = future
        self._request_owners[request_id] = key

        try:
            await ws.send_json({
                "type": "send_message",
                "request_id": request_id,
                "session_id": session_id,
                "message": message,
                "message_str": message_str,
            })
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            raise TimeoutError(f"Bridge timeout ({timeout}s) for source={source}")
        finally:
            self._pending_requests.pop(request_id, None)
            self._request_owners.pop(request_id, None)

    def resolve_request(self, request_id: str, result: dict) -> bool:
        """桥接返回 result 时调用，完成对应的 Future。"""
        future = self._pending_requests.get(request_id)
        if future is None or future.done():
            return False
        future.set_result(result)
        return True

    @property
    def active_connections(self) -> list[dict]:
        """列出所有活跃连接（用于状态监控）。"""
        return [
            {"user_id": str(uid), "source": src}
            for uid, src in self._connections.keys()
        ]


# 模块级单例
im_connection_manager = IMConnectionManager()
```

## 设计说明

| 决策 | 理由 |
|------|------|
| `asyncio.Lock` 仅保护 connect/disconnect | 读操作（get_connection）无需加锁，dict 读取是线程安全的 |
| 新连接替换旧连接 | 桥接重连时无需手动清理，自动替换 |
| disconnect 取消所有 pending Future | 防止 REST handler 永远阻塞 |
| Future + request_id 模式 | 简洁地桥接 REST（同步等待）和 WS（异步事件）两种协议 |
| 模块级单例 | 与 `agent_chat.py` 的 `_active_tasks` 模式一致 |
