# Step 9: 客户端 SDK 设计

## 1. 概述

本文档定义 Agent Chat API 的接口规范，供其他客户端 (Python、CLI、移动端等) 实现 SDK。

## 2. API 规范

### 2.1 认证

所有请求需要携带 Bearer Token：

```http
Authorization: Bearer <access_token>
```

Token 获取：
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}

Response:
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

### 2.2 SSE 聊天端点

#### 请求

```http
POST /api/v1/sessions/{session_id}/chat
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <token>

{
  "message": "Hello, how are you?",
  "topic_id": "uuid-optional",
  "stream": true
}
```

#### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息，1-10000 字符 |
| topic_id | uuid | 否 | Topic ID，不提供则自动创建 |
| stream | boolean | 否 | 是否流式，默认 true |

#### SSE 响应

```
event: message
data: {"content": "Hello"}

event: message
data: {"content": "! How"}

event: message
data: {"content": " can I help?"}

event: tool_call
data: {"name": "search", "args": {"query": "weather"}}

event: tool_result
data: {"name": "search", "result": "Sunny, 25°C"}

event: done
data: {"status": "complete"}
```

#### 事件类型

| 事件 | 数据结构 | 说明 |
|------|----------|------|
| message | `{"content": string}` | 文本内容块 |
| tool_call | `{"name": string, "args": object}` | 工具调用开始 |
| tool_result | `{"name": string, "result": string}` | 工具调用结果 |
| done | `{"status": "complete" \| "cancelled"}` | 流结束 |
| error | `{"error": string}` | 错误 |

### 2.3 非流式聊天

```http
POST /api/v1/sessions/{session_id}/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": "Hello",
  "topic_id": "uuid-optional",
  "stream": false
}

Response:
{
  "message": "Hello! How can I help you today?",
  "session_id": "uuid",
  "topic_id": "uuid",
  "message_id": "uuid"
}
```

### 2.4 停止生成

```http
POST /api/v1/sessions/{session_id}/chat/stop?topic_id={topic_id}
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Generation stopped"
}
```

### 2.5 WebSocket 端点

#### 连接

```
ws://host/api/v1/sessions/{session_id}/chat/ws?token={jwt_token}
```

#### 客户端 → 服务端

```json
// 发送消息
{"type": "message", "content": "Hello", "topic_id": "uuid-optional"}

// 停止生成
{"type": "stop"}
```

#### 服务端 → 客户端

```json
// 文本块
{"type": "chunk", "content": "Hello"}

// 工具调用
{"type": "tool_call", "name": "search", "args": {"query": "..."}}

// 工具结果
{"type": "tool_result", "name": "search", "result": "..."}

// 完成
{"type": "done"}

// 已停止
{"type": "stopped"}

// 错误
{"type": "error", "message": "Error description"}
```

## 3. Python SDK

### 3.1 安装

```bash
pip install metahub-sdk
```

### 3.2 基本使用

```python
from metahub_sdk import MetaHubClient

# 创建客户端
client = MetaHubClient(
    base_url="https://api.example.com",
    api_key="your-api-key",  # 或使用 email/password 登录
)

# 流式聊天
for chunk in client.chat(session_id, "Hello"):
    if chunk.type == "message":
        print(chunk.content, end="", flush=True)
    elif chunk.type == "tool_call":
        print(f"\n[Calling {chunk.name}...]")
    elif chunk.type == "done":
        print("\n--- Done ---")

# 非流式聊天
response = client.chat(session_id, "Hello", stream=False)
print(response.message)

# 停止生成
client.stop(session_id, topic_id)
```

### 3.3 SDK 实现

```python
# metahub_sdk/client.py
from typing import Iterator, Optional, Union
from dataclasses import dataclass
import requests
import sseclient

@dataclass
class ChatChunk:
    type: str  # message, tool_call, tool_result, done, error
    content: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict] = None
    result: Optional[str] = None
    error: Optional[str] = None

@dataclass
class ChatResponse:
    message: str
    session_id: str
    topic_id: str
    message_id: str

class MetaHubClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        email: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()

        if api_key:
            self._session.headers["Authorization"] = f"Bearer {api_key}"
        elif email and password:
            self._login(email, password)

    def _login(self, email: str, password: str):
        response = self._session.post(
            f"{self.base_url}/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        response.raise_for_status()
        token = response.json()["access_token"]
        self._session.headers["Authorization"] = f"Bearer {token}"

    def chat(
        self,
        session_id: str,
        message: str,
        topic_id: Optional[str] = None,
        stream: bool = True,
    ) -> Union[Iterator[ChatChunk], ChatResponse]:
        """
        Send a chat message.

        Args:
            session_id: Session ID
            message: User message
            topic_id: Optional topic ID
            stream: Whether to stream response

        Returns:
            Iterator of ChatChunk if stream=True, ChatResponse otherwise
        """
        url = f"{self.base_url}/api/v1/sessions/{session_id}/chat"
        data = {
            "message": message,
            "topic_id": topic_id,
            "stream": stream,
        }

        if stream:
            return self._stream_chat(url, data)
        else:
            response = self._session.post(url, json=data)
            response.raise_for_status()
            return ChatResponse(**response.json())

    def _stream_chat(self, url: str, data: dict) -> Iterator[ChatChunk]:
        """Stream chat response."""
        response = self._session.post(
            url,
            json=data,
            headers={"Accept": "text/event-stream"},
            stream=True,
        )
        response.raise_for_status()

        client = sseclient.SSEClient(response)
        for event in client.events():
            import json
            event_data = json.loads(event.data)

            if event.event == "message":
                yield ChatChunk(type="message", content=event_data["content"])
            elif event.event == "tool_call":
                yield ChatChunk(
                    type="tool_call",
                    name=event_data["name"],
                    args=event_data["args"],
                )
            elif event.event == "tool_result":
                yield ChatChunk(
                    type="tool_result",
                    name=event_data["name"],
                    result=event_data["result"],
                )
            elif event.event == "done":
                yield ChatChunk(type="done")
            elif event.event == "error":
                yield ChatChunk(type="error", error=event_data["error"])

    def stop(self, session_id: str, topic_id: str) -> dict:
        """Stop ongoing generation."""
        url = f"{self.base_url}/api/v1/sessions/{session_id}/chat/stop"
        response = self._session.post(url, params={"topic_id": topic_id})
        response.raise_for_status()
        return response.json()
```

### 3.4 异步版本

```python
# metahub_sdk/async_client.py
from typing import AsyncIterator, Optional, Union
import aiohttp

class AsyncMetaHubClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._session = aiohttp.ClientSession(headers=headers)
        return self._session

    async def chat(
        self,
        session_id: str,
        message: str,
        topic_id: Optional[str] = None,
    ) -> AsyncIterator[ChatChunk]:
        """Stream chat response."""
        session = await self._get_session()
        url = f"{self.base_url}/api/v1/sessions/{session_id}/chat"

        async with session.post(
            url,
            json={"message": message, "topic_id": topic_id, "stream": True},
            headers={"Accept": "text/event-stream"},
        ) as response:
            async for line in response.content:
                line = line.decode().strip()
                if line.startswith("event:"):
                    event_type = line.split(":")[1].strip()
                elif line.startswith("data:"):
                    import json
                    data = json.loads(line[5:])

                    if event_type == "message":
                        yield ChatChunk(type="message", content=data["content"])
                    elif event_type == "done":
                        yield ChatChunk(type="done")
                    # ... 其他事件处理

    async def close(self):
        if self._session:
            await self._session.close()
            self._session = None
```

## 4. CLI 工具

### 4.1 安装

```bash
pip install metahub-cli
```

### 4.2 使用

```bash
# 配置
metahub config set api-key sk-xxx
metahub config set base-url https://api.example.com

# 聊天
metahub chat <session-id> "Hello"

# 交互模式
metahub chat <session-id> --interactive

# 查看历史
metahub history <session-id> <topic-id>
```

### 4.3 CLI 实现

```python
# metahub_cli/main.py
import click
from metahub_sdk import MetaHubClient

@click.group()
def cli():
    """MetaHub CLI - Chat with AI agents."""
    pass

@cli.command()
@click.argument("session_id")
@click.argument("message", required=False)
@click.option("--interactive", "-i", is_flag=True)
def chat(session_id: str, message: str, interactive: bool):
    """Send a message to the AI agent."""
    client = get_client()

    if interactive:
        run_interactive(client, session_id)
    else:
        if not message:
            raise click.UsageError("Message required in non-interactive mode")

        for chunk in client.chat(session_id, message):
            if chunk.type == "message":
                click.echo(chunk.content, nl=False)
            elif chunk.type == "tool_call":
                click.echo(f"\n[Calling {chunk.name}...]", err=True)
            elif chunk.type == "done":
                click.echo()

def run_interactive(client, session_id: str):
    """Run interactive chat."""
    click.echo("Interactive mode. Type 'exit' to quit.")
    topic_id = None

    while True:
        try:
            message = click.prompt("You")
            if message.lower() == "exit":
                break

            for chunk in client.chat(session_id, message, topic_id):
                if chunk.type == "message":
                    click.echo(chunk.content, nl=False)
                elif chunk.type == "done":
                    click.echo()

        except KeyboardInterrupt:
            click.echo("\nInterrupted.")
            break

if __name__ == "__main__":
    cli()
```

## 5. 错误处理

### 5.1 HTTP 错误码

| 状态码 | 说明 | 处理建议 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查参数格式 |
| 401 | 未认证 | 重新登录 |
| 403 | 无权限 | 检查 session 所有权 |
| 404 | 资源不存在 | 检查 session/topic ID |
| 429 | 请求过于频繁 | 等待后重试 |
| 500 | 服务器错误 | 重试或联系支持 |

### 5.2 SSE 错误事件

```
event: error
data: {"error": "Rate limit exceeded", "code": "RATE_LIMIT"}
```

### 5.3 错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_SESSION` | Session 无效或无权限 |
| `NO_AGENT` | Session 未关联 Agent |
| `AGENT_ERROR` | Agent 执行错误 |
| `RATE_LIMIT` | 请求频率超限 |
| `TIMEOUT` | 执行超时 |
| `CANCELLED` | 用户取消 |

## 6. 最佳实践

### 6.1 重试策略

```python
import time
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
def chat_with_retry(client, session_id, message):
    return client.chat(session_id, message, stream=False)
```

### 6.2 连接池

```python
# 复用 session
client = MetaHubClient(base_url, api_key)

# 多次调用复用连接
client.chat(session1, "Hello")
client.chat(session2, "World")
```

### 6.3 超时设置

```python
client = MetaHubClient(
    base_url,
    api_key,
    timeout=30,  # 请求超时
    stream_timeout=300,  # 流式超时
)
```

## 7. 版本兼容

| SDK 版本 | API 版本 | 说明 |
|----------|----------|------|
| 1.0.x | v1 | 初始版本 |

## 8. 参考资料

- [API 文档](./00-OVERVIEW.md)
- [SSE 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [WebSocket 规范](https://tools.ietf.org/html/rfc6455)
