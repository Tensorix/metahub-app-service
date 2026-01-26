# Step 8: 前后端集成测试

## 1. 目标

- 端到端测试完整流程
- 验证 SSE 和 WebSocket 功能
- 性能和稳定性测试

## 2. 测试环境准备

### 2.1 后端测试环境

```bash
# 创建测试数据库
createdb metahub_test

# 设置测试环境变量
export DATABASE_URL=postgresql://user:pass@localhost:5432/metahub_test
export OPENAI_API_KEY=sk-test-xxx
export OPENAI_BASE_URL=https://api.openai.com/v1

# 运行迁移
alembic upgrade head
```

### 2.2 测试数据准备

```python
# tests/fixtures.py
import pytest
from uuid import UUID
import uuid7
from sqlalchemy.orm import Session

from app.db.model import User, Session as SessionModel, Agent, Topic, Message

@pytest.fixture
def test_user(db: Session) -> User:
    user = User(
        id=uuid7.create(),
        email="test@example.com",
        password_hash="hashed",
    )
    db.add(user)
    db.commit()
    return user

@pytest.fixture
def test_agent(db: Session, test_user: User) -> Agent:
    agent = Agent(
        id=uuid7.create(),
        user_id=test_user.id,
        name="Test Agent",
        metadata_={
            "model": "gpt-4o-mini",
            "system_prompt": "You are a test assistant.",
            "tools": ["calculator"],
        },
    )
    db.add(agent)
    db.commit()
    return agent

@pytest.fixture
def test_ai_session(db: Session, test_user: User, test_agent: Agent) -> SessionModel:
    session = SessionModel(
        id=uuid7.create(),
        user_id=test_user.id,
        name="Test AI Session",
        type="ai",
        agent_id=test_agent.id,
    )
    db.add(session)
    db.commit()
    return session
```

## 3. 后端 API 测试

### 3.1 SSE 端点测试

```python
# tests/test_agent_chat_api.py
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_chat_sse_success(
    client: AsyncClient,
    test_ai_session,
    auth_headers,
):
    """Test successful SSE chat."""
    response = await client.post(
        f"/api/v1/sessions/{test_ai_session.id}/chat",
        json={"message": "Hello", "stream": True},
        headers={**auth_headers, "Accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    # Parse SSE events
    events = []
    async for line in response.aiter_lines():
        if line.startswith("event:"):
            event_type = line.split(":")[1].strip()
        elif line.startswith("data:"):
            import json
            data = json.loads(line[5:])
            events.append({"event": event_type, "data": data})

    # Should have message events and done event
    assert any(e["event"] == "message" for e in events)
    assert events[-1]["event"] == "done"

@pytest.mark.asyncio
async def test_chat_non_streaming(
    client: AsyncClient,
    test_ai_session,
    auth_headers,
):
    """Test non-streaming chat."""
    response = await client.post(
        f"/api/v1/sessions/{test_ai_session.id}/chat",
        json={"message": "Hello", "stream": False},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "session_id" in data
    assert "topic_id" in data

@pytest.mark.asyncio
async def test_chat_invalid_session(
    client: AsyncClient,
    auth_headers,
):
    """Test chat with non-existent session."""
    response = await client.post(
        "/api/v1/sessions/00000000-0000-0000-0000-000000000000/chat",
        json={"message": "Hello"},
        headers=auth_headers,
    )

    assert response.status_code == 404

@pytest.mark.asyncio
async def test_chat_non_ai_session(
    client: AsyncClient,
    test_user,
    db,
    auth_headers,
):
    """Test chat with non-AI session."""
    # Create regular session
    session = SessionModel(
        id=uuid7.create(),
        user_id=test_user.id,
        name="Regular Session",
        type="regular",
    )
    db.add(session)
    db.commit()

    response = await client.post(
        f"/api/v1/sessions/{session.id}/chat",
        json={"message": "Hello"},
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert "not an AI session" in response.json()["detail"]

@pytest.mark.asyncio
async def test_stop_generation(
    client: AsyncClient,
    test_ai_session,
    auth_headers,
):
    """Test stop generation endpoint."""
    topic_id = uuid7.create()

    response = await client.post(
        f"/api/v1/sessions/{test_ai_session.id}/chat/stop",
        params={"topic_id": str(topic_id)},
        headers=auth_headers,
    )

    # Should return success even if no active generation
    assert response.status_code == 200
```

### 3.2 WebSocket 测试

```python
# tests/test_agent_chat_ws.py
import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient
from starlette.websockets import WebSocket

@pytest.mark.asyncio
async def test_websocket_chat(
    app,
    test_ai_session,
    auth_token,
):
    """Test WebSocket chat."""
    from starlette.testclient import TestClient

    with TestClient(app) as client:
        with client.websocket_connect(
            f"/api/v1/sessions/{test_ai_session.id}/chat/ws?token={auth_token}"
        ) as ws:
            # Send message
            ws.send_json({
                "type": "message",
                "content": "Hello",
            })

            # Receive responses
            messages = []
            while True:
                data = ws.receive_json()
                messages.append(data)
                if data["type"] in ["done", "error"]:
                    break

            # Should have chunk messages
            assert any(m["type"] == "chunk" for m in messages)
            assert messages[-1]["type"] == "done"

@pytest.mark.asyncio
async def test_websocket_stop(
    app,
    test_ai_session,
    auth_token,
):
    """Test WebSocket stop command."""
    with TestClient(app) as client:
        with client.websocket_connect(
            f"/api/v1/sessions/{test_ai_session.id}/chat/ws?token={auth_token}"
        ) as ws:
            # Send message
            ws.send_json({"type": "message", "content": "Write a long story"})

            # Immediately send stop
            ws.send_json({"type": "stop"})

            # Should receive stopped
            messages = []
            while True:
                data = ws.receive_json()
                messages.append(data)
                if data["type"] in ["done", "stopped", "error"]:
                    break

            assert any(m["type"] == "stopped" for m in messages)
```

## 4. 前端集成测试

### 4.1 API 客户端测试

```typescript
// frontend/src/lib/__tests__/agentApi.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chatWithAgentStream, chatWithAgent, AgentWSClient } from '../agentApi';

describe('Agent API Integration', () => {
  let sessionId: string;
  let token: string;

  beforeAll(async () => {
    // Login and create test session
    const loginRes = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password',
      }),
    });
    const { access_token } = await loginRes.json();
    token = access_token;
    localStorage.setItem('token', token);

    // Create AI session
    const sessionRes = await fetch('/api/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Test Session',
        type: 'ai',
        agent_id: 'test-agent-id',
      }),
    });
    const session = await sessionRes.json();
    sessionId = session.id;
  });

  afterAll(async () => {
    // Cleanup
    localStorage.removeItem('token');
  });

  it('should stream chat response', async () => {
    const events: any[] = [];

    for await (const event of chatWithAgentStream(sessionId, 'Hello')) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.event === 'message')).toBe(true);
    expect(events[events.length - 1].event).toBe('done');
  });

  it('should handle non-streaming chat', async () => {
    const response = await chatWithAgent(sessionId, 'Hello');

    expect(response.message).toBeDefined();
    expect(response.session_id).toBe(sessionId);
  });

  it('should connect via WebSocket', async () => {
    const client = new AgentWSClient(sessionId);
    const messages: any[] = [];

    client.onMessage = (msg) => messages.push(msg);

    await client.connect();
    client.send('Hello');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 5000));

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.type === 'chunk')).toBe(true);

    client.disconnect();
  });
});
```

### 4.2 组件集成测试

```typescript
// frontend/src/components/chat/__tests__/integration.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AIChatPage } from '../AIChatPage';
import { useChatStore } from '@/store/chat';

describe('AI Chat Page Integration', () => {
  beforeEach(() => {
    // Reset store
    useChatStore.setState({
      currentSessionId: 'test-session-id',
      currentTopicId: null,
      messages: [],
      isStreaming: false,
    });
  });

  it('should send message and display response', async () => {
    render(<AIChatPage />);

    // Type message
    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello' } });

    // Send message
    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);

    // Wait for response
    await waitFor(
      () => {
        expect(screen.getByText(/hello/i)).toBeInTheDocument();
      },
      { timeout: 10000 }
    );
  });

  it('should show streaming indicator', async () => {
    render(<AIChatPage />);

    // Set streaming state
    useChatStore.setState({ isStreaming: true });

    // Should show stop button
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });
});
```

## 5. E2E 测试

### 5.1 Playwright 测试

```typescript
// tests/e2e/agent-chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Agent Chat E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should send message and receive response', async ({ page }) => {
    // Navigate to AI session
    await page.click('[data-testid="ai-session"]');

    // Type and send message
    await page.fill('[data-testid="message-input"]', 'Hello');
    await page.click('[data-testid="send-button"]');

    // Wait for response
    await expect(page.locator('[data-testid="ai-message"]')).toBeVisible({
      timeout: 30000,
    });

    // Verify response content
    const aiMessage = page.locator('[data-testid="ai-message"]').first();
    await expect(aiMessage).toContainText(/.+/);
  });

  test('should stop generation', async ({ page }) => {
    await page.click('[data-testid="ai-session"]');

    // Send long message
    await page.fill('[data-testid="message-input"]', 'Write a very long story about a dragon');
    await page.click('[data-testid="send-button"]');

    // Click stop button
    await page.click('[data-testid="stop-button"]');

    // Verify stopped
    await expect(page.locator('[data-testid="send-button"]')).toBeVisible();
  });

  test('should display tool calls', async ({ page }) => {
    await page.click('[data-testid="ai-session"]');

    // Send message that triggers tool
    await page.fill('[data-testid="message-input"]', 'Calculate 123 * 456');
    await page.click('[data-testid="send-button"]');

    // Wait for tool indicator
    await expect(page.locator('[data-testid="tool-indicator"]')).toBeVisible({
      timeout: 30000,
    });
  });
});
```

## 6. 性能测试

### 6.1 负载测试

```python
# tests/load/test_chat_load.py
import asyncio
import aiohttp
import time
from statistics import mean, stdev

async def send_chat_request(session, url, token, message):
    """Send a single chat request."""
    start = time.time()

    async with session.post(
        url,
        json={"message": message, "stream": False},
        headers={"Authorization": f"Bearer {token}"},
    ) as response:
        await response.json()

    return time.time() - start

async def run_load_test(
    base_url: str,
    session_id: str,
    token: str,
    num_requests: int = 100,
    concurrency: int = 10,
):
    """Run load test."""
    url = f"{base_url}/api/v1/sessions/{session_id}/chat"

    async with aiohttp.ClientSession() as session:
        # Create semaphore for concurrency control
        sem = asyncio.Semaphore(concurrency)

        async def limited_request(i):
            async with sem:
                return await send_chat_request(
                    session, url, token, f"Test message {i}"
                )

        # Run requests
        start = time.time()
        results = await asyncio.gather(
            *[limited_request(i) for i in range(num_requests)]
        )
        total_time = time.time() - start

    # Calculate statistics
    print(f"Total requests: {num_requests}")
    print(f"Concurrency: {concurrency}")
    print(f"Total time: {total_time:.2f}s")
    print(f"Requests/sec: {num_requests / total_time:.2f}")
    print(f"Mean latency: {mean(results) * 1000:.2f}ms")
    print(f"Stdev latency: {stdev(results) * 1000:.2f}ms")
    print(f"Min latency: {min(results) * 1000:.2f}ms")
    print(f"Max latency: {max(results) * 1000:.2f}ms")

if __name__ == "__main__":
    asyncio.run(run_load_test(
        "http://localhost:8000",
        "session-id",
        "token",
        num_requests=100,
        concurrency=10,
    ))
```

## 7. 测试清单

### 7.1 功能测试

- [ ] SSE 流式响应
- [ ] 非流式响应
- [ ] WebSocket 连接
- [ ] WebSocket 消息
- [ ] WebSocket 停止
- [ ] Topic 自动创建
- [ ] 消息持久化
- [ ] 多轮对话
- [ ] 工具调用
- [ ] 错误处理

### 7.2 边界测试

- [ ] 超长消息 (10000 字符)
- [ ] 空消息
- [ ] 特殊字符
- [ ] 并发请求
- [ ] 连接断开恢复
- [ ] Token 过期

### 7.3 性能测试

- [ ] 响应延迟 < 500ms (首字节)
- [ ] 吞吐量 > 10 req/s
- [ ] 内存使用稳定
- [ ] 无内存泄漏

## 8. 运行测试

```bash
# 后端测试
pytest tests/test_agent_chat*.py -v

# 前端测试
cd frontend && npm test

# E2E 测试
playwright test tests/e2e/agent-chat.spec.ts

# 负载测试
python tests/load/test_chat_load.py
```

## 9. 下一步

完成集成测试后，进入 [09-CLIENT-SDK.md](./09-CLIENT-SDK.md) 了解客户端 SDK 设计。
