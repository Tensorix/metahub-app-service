# MCP 集成快速开始

## 什么是 MCP?

MCP (Model Context Protocol) 是一个标准协议,允许 AI Agent 连接外部工具服务器,动态扩展能力。

## 快速开始

### 1. 为 Agent 添加 MCP Server

```bash
# 创建 MCP Server 配置
POST /api/v1/agents/{agent_id}/mcp-servers
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "database-tools",
  "description": "PostgreSQL 数据库查询工具",
  "url": "http://localhost:8000/mcp",
  "headers": {
    "Authorization": "Bearer db-token-xxx"
  },
  "is_enabled": true
}
```

### 2. 测试连接

```bash
POST /api/v1/agents/{agent_id}/mcp-servers/test
{
  "url": "http://localhost:8000/mcp",
  "headers": {
    "Authorization": "Bearer db-token-xxx"
  }
}

# 响应示例
{
  "success": true,
  "message": "Connected. Found 3 tools.",
  "tools": [
    {"name": "query_database", "description": "Execute SQL queries"},
    {"name": "list_tables", "description": "List all database tables"}
  ],
  "latency_ms": 156.23
}
```

### 3. 使用 MCP 工具

配置完成后,Agent 会自动加载 MCP 工具。在对话中,LLM 可以自动调用这些工具:

```
用户: 查询数据库中的用户表
Agent: [调用 list_tables 工具]
Agent: [调用 query_database 工具]
Agent: 数据库中有 150 个用户...
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents/{id}/mcp-servers` | 列出 MCP Servers |
| POST | `/agents/{id}/mcp-servers` | 添加 MCP Server |
| GET | `/agents/{id}/mcp-servers/{server_id}` | 获取详情 |
| PUT | `/agents/{id}/mcp-servers/{server_id}` | 更新配置 |
| DELETE | `/agents/{id}/mcp-servers/{server_id}` | 删除配置 |
| POST | `/agents/{id}/mcp-servers/test` | 测试连接 |

## 配置项

```env
# .env 文件 (可选)
MCP_CLIENT_TIMEOUT=30              # 工具调用超时(秒)
MCP_CONNECTION_TIMEOUT=10          # 连接超时(秒)
MCP_MAX_RETRIES=3                  # 重试次数
MCP_TOOL_CACHE_TTL=300            # 工具缓存时间(秒)
MCP_MAX_SERVERS_PER_AGENT=10      # 每个 Agent 最多 Server 数
```

## 前端使用

```typescript
import { MCPServerConfig } from '@/components/MCPServerConfig';

// 在 AgentDialog 中使用
<MCPServerConfig
  agentId={agent.id}
  servers={agent.mcp_servers || []}
  onChange={(servers) => {
    // 更新 Agent 配置
  }}
/>
```

## 工作原理

1. **配置阶段**: 用户为 Agent 配置 MCP Server (URL + Headers)
2. **加载阶段**: Agent 对话时,自动从 MCP Server 获取可用工具
3. **缓存机制**: 工具列表缓存 5 分钟,避免频繁请求
4. **工具调用**: LLM 决定调用工具时,通过 MCP Client 执行
5. **结果返回**: 工具结果返回给 LLM,继续对话

## 特性

- ✅ **无状态连接**: HTTP/SSE 传输,适合生产环境
- ✅ **工具缓存**: 5 分钟 TTL,提高性能
- ✅ **优雅降级**: 单个 Server 失败不影响整体
- ✅ **安全性**: 敏感 header 自动脱敏
- ✅ **工具合并**: 内置工具 + MCP 工具无缝集成

## 示例: 创建简单的 MCP Server

使用 FastMCP 创建一个简单的数学工具服务器:

```python
from fastmcp import FastMCP

mcp = FastMCP("MathTools")

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```

然后在 Agent 中配置:
```json
{
  "name": "math-tools",
  "url": "http://localhost:8000/mcp",
  "is_enabled": true
}
```

## 故障排查

### 连接失败
- 检查 MCP Server 是否运行
- 检查 URL 是否正确
- 检查网络连接

### 工具未加载
- 确认 `is_enabled=true`
- 等待缓存过期 (5分钟) 或重启服务
- 查看日志确认工具获取过程

### 工具调用失败
- 检查 MCP Server 日志
- 确认参数格式正确
- 检查超时配置

## 更多信息

- 完整文档: `MCP_INTEGRATION_COMPLETE.md`
- 设计文档: `docs/mcp-integration/`
- MCP 协议: https://modelcontextprotocol.io
