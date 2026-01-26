# Step 1: 后端依赖和配置

## 1. 目标

- 添加 LangGraph 相关依赖
- 更新配置文件支持 Agent Chat
- 验证依赖安装

## 2. 依赖说明

| 包名 | 版本 | 用途 |
|------|------|------|
| `langgraph` | >=0.2.0 | Agent 状态机编排 |
| `langgraph-checkpoint-postgres` | >=0.2.0 | PostgreSQL 持久化 |
| `sse-starlette` | >=2.0.0 | SSE 响应支持 |

## 3. 文件修改

### 3.1 pyproject.toml

```diff
 dependencies = [
     "langchain>=0.3.0",
     "langchain-openai>=0.2.0",
     "langchain-core>=0.3.0",
+    "langgraph>=0.2.0",
+    "langgraph-checkpoint-postgres>=0.2.0",
+    "sse-starlette>=2.0.0",
 ]
```

**完整修改位置**：在 `langchain-core` 后添加三个依赖。

### 3.2 app/config.py

在 `OPENAI_BASE_URL` 配置后添加：

```python
# Agent Chat 配置
AGENT_MAX_ITERATIONS: int = 50      # Agent 最大迭代次数
AGENT_TIMEOUT: int = 300            # Agent 执行超时 (秒)
AGENT_DEFAULT_MODEL: str = "gpt-4o-mini"  # 默认模型
```

**完整配置类示例**：

```python
class Settings(BaseSettings):
    # ... 现有配置 ...

    # OpenAI 配置（用于 LangChain Agent）
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # Agent Chat 配置
    AGENT_MAX_ITERATIONS: int = 50
    AGENT_TIMEOUT: int = 300
    AGENT_DEFAULT_MODEL: str = "gpt-4o-mini"

    # ... 其他配置 ...
```

## 4. 配置项说明

### 4.1 AGENT_MAX_ITERATIONS

- **类型**：int
- **默认值**：50
- **说明**：Agent ReAct 循环的最大迭代次数，防止无限循环
- **建议**：根据任务复杂度调整，复杂任务可设置更高

### 4.2 AGENT_TIMEOUT

- **类型**：int (秒)
- **默认值**：300
- **说明**：单次 Agent 调用的超时时间
- **建议**：考虑 LLM 响应时间和工具执行时间

### 4.3 AGENT_DEFAULT_MODEL

- **类型**：str
- **默认值**：gpt-4o-mini
- **说明**：当 Agent 未指定模型时使用的默认模型
- **可选值**：
  - `gpt-4o-mini` - OpenAI 轻量模型
  - `gpt-4o` - OpenAI 强力模型
  - `deepseek-chat` - DeepSeek 对话模型
  - `deepseek-reasoner` - DeepSeek 推理模型

## 5. 环境变量示例

**.env 文件**：

```bash
# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/metahub

# OpenAI 兼容 API (使用 DeepSeek)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.deepseek.com/v1

# Agent 配置 (可选，使用默认值)
AGENT_MAX_ITERATIONS=50
AGENT_TIMEOUT=300
AGENT_DEFAULT_MODEL=deepseek-chat
```

## 6. 验证步骤

### 6.1 安装依赖

```bash
# 使用 uv 安装
uv sync

# 或使用 pip
pip install -e .
```

### 6.2 验证导入

```bash
python -c "
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sse_starlette.sse import EventSourceResponse
print('All imports successful!')
"
```

### 6.3 验证配置

```bash
python -c "
from app.config import config
print(f'AGENT_MAX_ITERATIONS: {config.AGENT_MAX_ITERATIONS}')
print(f'AGENT_TIMEOUT: {config.AGENT_TIMEOUT}')
print(f'AGENT_DEFAULT_MODEL: {config.AGENT_DEFAULT_MODEL}')
print(f'OPENAI_BASE_URL: {config.OPENAI_BASE_URL}')
"
```

## 7. 注意事项

### 7.1 PostgreSQL 版本要求

`langgraph-checkpoint-postgres` 需要 PostgreSQL 12+，确保数据库版本兼容。

### 7.2 异步支持

使用 `AsyncPostgresSaver` 需要异步数据库连接，确保使用 `asyncpg` 驱动。

### 7.3 OpenAI 兼容性

通过设置 `OPENAI_BASE_URL`，可以使用任何 OpenAI 兼容的 API：

| 提供商 | Base URL |
|--------|----------|
| OpenAI | https://api.openai.com/v1 |
| DeepSeek | https://api.deepseek.com/v1 |
| Azure OpenAI | https://{resource}.openai.azure.com/ |
| 本地 Ollama | http://localhost:11434/v1 |

## 8. 下一步

完成依赖安装后，进入 [02-BACKEND-SERVICE.md](./02-BACKEND-SERVICE.md) 实现 Deep Agent 服务。
