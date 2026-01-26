# DeepAgents Verification & Testing

## Pre-Implementation Checklist

### 依赖检查
```bash
# 确认 deepagents 已安装
uv pip show deepagents

# 确认版本兼容
uv pip show langchain langgraph
```

### 环境变量检查
```bash
# 必需的环境变量
echo $OPENAI_API_KEY
echo $OPENAI_BASE_URL
```

---

## Step-by-Step Verification

### 1. 配置更新验证

```bash
# 启动 Python REPL
python -c "from app.config import config; print(config.AGENT_DEFAULT_PROVIDER)"
```

**预期输出:** `openai`

---

### 2. 模型初始化验证

```python
# tests/agent/test_model_init.py
import pytest
from app.agent.deep_agent_service import DeepAgentService

def test_model_string_with_provider():
    service = DeepAgentService({"model": "gpt-4o", "model_provider": "openai"})
    assert service._get_model_string() == "openai:gpt-4o"

def test_model_string_already_formatted():
    service = DeepAgentService({"model": "anthropic:claude-3"})
    assert service._get_model_string() == "anthropic:claude-3"

def test_model_string_default_provider():
    service = DeepAgentService({"model": "gpt-4o-mini"})
    assert service._get_model_string() == "openai:gpt-4o-mini"
```

---

### 3. Subagents 构建验证

```python
# tests/agent/test_subagents.py
import pytest
from app.agent.deep_agent_service import DeepAgentService

def test_build_subagents_empty():
    service = DeepAgentService({})
    assert service._build_subagents() == []

def test_build_subagents_with_config():
    config = {
        "subagents": [
            {
                "name": "researcher",
                "description": "Research tasks",
                "system_prompt": "You are a researcher.",
                "tools": [],
            }
        ]
    }
    service = DeepAgentService(config)
    subagents = service._build_subagents()

    assert len(subagents) == 1
    assert subagents[0]["name"] == "researcher"
    assert subagents[0]["description"] == "Research tasks"
```

---

### 4. Backend 构建验证

```python
# tests/agent/test_backend.py
import pytest
from app.agent.deep_agent_service import DeepAgentService
from langgraph.store.memory import InMemoryStore

def test_build_backend_without_store():
    service = DeepAgentService({})
    assert service._build_backend() is None

def test_build_backend_with_store():
    store = InMemoryStore()
    service = DeepAgentService({}, store=store)
    backend = service._build_backend()

    assert backend is not None
    # Backend should route /memories/ differently
```

---

### 5. 流式响应验证

```bash
# 手动测试流式 API
curl -X POST "http://localhost:8000/api/v1/sessions/{session_id}/chat" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you do?", "stream": true}'
```

**预期 SSE 事件:**
```
event: message
data: {"content": "I can help you with..."}

event: done
data: {"status": "complete"}
```

---

### 6. 内置工具验证

```bash
# 测试文件系统工具
curl -X POST "http://localhost:8000/api/v1/sessions/{session_id}/chat" \
  -H "Authorization: Bearer {token}" \
  -d '{"message": "List files in current directory", "stream": true}'
```

**预期:** Agent 使用 `ls` 工具列出目录

---

### 7. Memory 路由验证

```bash
# 测试持久化内存
curl -X POST "..." -d '{"message": "Remember my name is Alice"}'

# 新对话中验证
curl -X POST "..." -d '{"message": "What is my name?"}'
```

**预期:** Agent 应能跨对话记住信息（通过 `/memories/` 路由）

---

## Integration Tests

### 完整对话流程测试

```python
# tests/agent/test_integration.py
import pytest
from app.agent.factory import AgentFactory

@pytest.mark.asyncio
async def test_full_conversation_flow():
    """Test complete conversation with streaming."""
    agent_config = {
        "model": "openai:gpt-4o-mini",
        "system_prompt": "You are a helpful assistant.",
        "tools": [],
    }

    agent = await AgentFactory.create_agent(
        agent_id=uuid4(),
        agent_config=agent_config,
    )

    # Non-streaming
    response = await agent.chat("Hello", thread_id="test-thread")
    assert response and len(response) > 0

    # Streaming
    events = []
    async for event in agent.chat_stream("Hi again", thread_id="test-thread"):
        events.append(event)

    assert any(e["event"] == "message" for e in events)
    assert events[-1]["event"] == "done"
```

---

## Rollback Plan

如果迁移失败，回滚步骤：

1. **恢复 deep_agent_service.py**
   ```bash
   git checkout HEAD~1 -- app/agent/deep_agent_service.py
   ```

2. **恢复 config.py**
   ```bash
   git checkout HEAD~1 -- app/config.py
   ```

3. **重启服务**
   ```bash
   uv run uvicorn app.main:app --reload
   ```

---

## Post-Migration Checklist

- [ ] 所有单元测试通过
- [ ] 流式响应正常工作
- [ ] 内置文件系统工具可用
- [ ] Subagents 配置生效
- [ ] Memory 路由正常
- [ ] 现有对话历史可访问
- [ ] 性能无明显下降
