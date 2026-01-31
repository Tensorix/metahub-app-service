# Step 1: 依赖安装与配置项

## 1.1 新增依赖

### pyproject.toml 变更

```toml
# 在 dependencies 列表中新增:
"langchain-mcp-adapters>=0.1.0",
```

`langchain-mcp-adapters` 会自动安装以下传递依赖:
- `mcp` - MCP 协议 SDK
- `httpx` - HTTP 客户端（项目已有）
- `langchain-core` - LangChain 核心（项目已有）

### 安装命令

```bash
uv add langchain-mcp-adapters
```

## 1.2 配置项变更

### app/config.py 新增配置

```python
class Settings(BaseSettings):
    # ... 现有配置 ...

    # MCP Client 配置
    MCP_CLIENT_TIMEOUT: int = 30            # MCP 工具调用超时（秒）
    MCP_CONNECTION_TIMEOUT: int = 10        # MCP Server 连接超时（秒）
    MCP_MAX_RETRIES: int = 3               # MCP 调用失败重试次数
    MCP_TOOL_CACHE_TTL: int = 300          # MCP 工具列表缓存时间（秒）
    MCP_MAX_SERVERS_PER_AGENT: int = 10    # 每个 Agent 最多连接的 MCP Server 数
```

### 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `MCP_CLIENT_TIMEOUT` | 30 | 单次 MCP 工具调用的超时时间（秒） |
| `MCP_CONNECTION_TIMEOUT` | 10 | 连接 MCP Server 的超时时间（秒） |
| `MCP_MAX_RETRIES` | 3 | 工具调用失败时的重试次数 |
| `MCP_TOOL_CACHE_TTL` | 300 | 从 MCP Server 获取的工具列表缓存时间，避免频繁请求 |
| `MCP_MAX_SERVERS_PER_AGENT` | 10 | 限制每个 Agent 可配置的 MCP Server 上限 |

### .env 示例

```env
# MCP Configuration (可选，使用默认值即可)
MCP_CLIENT_TIMEOUT=30
MCP_CONNECTION_TIMEOUT=10
MCP_MAX_RETRIES=3
MCP_TOOL_CACHE_TTL=300
MCP_MAX_SERVERS_PER_AGENT=10
```

## 1.3 兼容性确认

### 版本兼容矩阵

| 现有依赖 | 当前版本要求 | MCP 适配器要求 | 兼容性 |
|----------|------------|---------------|--------|
| langchain | >=0.3.0 | >=0.3.0 | ✅ |
| langchain-core | >=0.3.0 | >=0.3.0 | ✅ |
| langgraph | >=0.2.0 | >=0.2.0 | ✅ |
| httpx | >=0.28.1 | >=0.24.0 | ✅ |
| Python | >=3.13 | >=3.10 | ✅ |

### 潜在风险

1. **`langchain-mcp-adapters` 版本**: 该库相对较新，需要锁定测试通过的版本
2. **`mcp` SDK 版本**: 作为传递依赖，需确认与 MCP Server 端的协议版本兼容
3. **异步兼容**: 项目使用 asyncio，`langchain-mcp-adapters` 的 `MultiServerMCPClient` 原生支持 async

### 验证步骤

```bash
# 1. 安装依赖
uv add langchain-mcp-adapters

# 2. 验证导入
python -c "from langchain_mcp_adapters.client import MultiServerMCPClient; print('OK')"

# 3. 检查版本兼容
uv pip list | grep -E "(langchain|mcp|httpx)"
```
