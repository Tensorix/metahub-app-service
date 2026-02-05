# MCP 传输协议说明

根据 [LangChain MCP 官方文档](https://docs.langchain.com/oss/python/langchain/mcp#transports)，`langchain-mcp-adapters` 支持以下传输协议：

## 支持的传输协议

### 1. HTTP (推荐) ✅

- **传输类型**: `http` (也称为 `streamable-http`)
- **说明**: 使用 HTTP 请求进行客户端-服务器通信
- **适用场景**: 
  - 生产环境部署
  - 远程 MCP Server
  - Web 服务架构
  - 需要负载均衡和扩展性的场景

**配置示例**:
```python
{
    "weather": {
        "url": "http://localhost:8000/mcp",
        "transport": "http",
        "headers": {
            "Authorization": "Bearer token-xxx"
        }
    }
}
```

**特点**:
- ✅ 无状态连接
- ✅ 支持自定义 HTTP Headers (认证、追踪等)
- ✅ 防火墙友好
- ✅ 易于调试和监控
- ✅ 支持标准 HTTP 负载均衡

### 2. SSE (已弃用) ⚠️

- **传输类型**: `sse`
- **说明**: Server-Sent Events
- **状态**: 已被 MCP 规范弃用，但 langchain-mcp-adapters 仍支持
- **适用场景**: 仅用于兼容旧版 MCP Server

**配置示例**:
```python
{
    "legacy-server": {
        "url": "http://localhost:8000/mcp",
        "transport": "sse",
        "headers": {
            "Authorization": "Bearer token-xxx"
        }
    }
}
```

**注意**: 
- ⚠️ 不推荐用于新项目
- ⚠️ 未来可能被移除
- ✅ 建议迁移到 `http` 传输

### 3. stdio (本地进程)

- **传输类型**: `stdio`
- **说明**: 通过标准输入/输出与本地进程通信
- **适用场景**:
  - 本地工具和脚本
  - 简单的本地设置
  - 不需要网络通信的场景

**配置示例**:
```python
{
    "math": {
        "command": "python",
        "args": ["/path/to/math_server.py"],
        "transport": "stdio",
        "env": {
            "API_KEY": "xxx"
        }
    }
}
```

**特点**:
- ✅ 低延迟
- ✅ 高性能
- ✅ 不需要网络连接
- ❌ 仅限本地使用
- ❌ 不支持远程部署

## HTTP vs SSE 的区别

根据 MCP 社区的讨论和文档：

### SSE (旧版)
- 需要维护独立的端点进行双向通信
- 客户端到服务器: HTTP POST
- 服务器到客户端: SSE 流
- 需要两个不同的连接机制

### HTTP/Streamable HTTP (新版)
- 使用动态响应适配
- 服务器根据请求智能选择:
  - 立即 JSON 响应 (简单请求)
  - SSE 流式传输 (需要流式响应时)
- 单一端点处理所有通信
- 更简洁的架构

## 我们的实现

### langchain-mcp-adapters 0.1.0 API 变更

**重要**: 从 `langchain-mcp-adapters 0.1.0` 开始，`MultiServerMCPClient` 不再支持作为上下文管理器使用。

**旧的用法 (不再支持)**:
```python
async with MultiServerMCPClient(config) as client:
    tools = client.get_tools()  # ❌ 不再工作
```

**新的用法 (正确)**:
```python
# 方式 1: 直接调用 (推荐)
client = MultiServerMCPClient(config)
tools = await client.get_tools()  # ✅ 正确

# 方式 2: 使用 session (高级用法)
client = MultiServerMCPClient(config)
async with client.session(server_name) as session:
    tools = await load_mcp_tools(session)
```

我们的实现使用方式 1，这是最简单和推荐的方式。

### 默认传输协议
- **默认**: `http` (推荐)
- **原因**: 
  - 最新的 MCP 标准
  - 生产环境最佳实践
  - 更好的性能和可扩展性

### 配置示例

#### 1. HTTP 传输 (推荐)
```json
{
  "name": "database-tools",
  "transport": "http",
  "url": "http://mcp-server:8000/mcp",
  "headers": {
    "Authorization": "Bearer token-xxx"
  },
  "is_enabled": true
}
```

#### 2. SSE 传输 (兼容旧版)
```json
{
  "name": "legacy-server",
  "transport": "sse",
  "url": "http://old-server:8000/mcp",
  "headers": {
    "Authorization": "Bearer token-xxx"
  },
  "is_enabled": true
}
```

#### 3. stdio 传输 (本地进程)
```json
{
  "name": "local-tools",
  "transport": "stdio",
  "command": "python",
  "args": ["/path/to/server.py"],
  "env": {
    "API_KEY": "xxx"
  },
  "is_enabled": true
}
```

## 认证支持

HTTP 和 SSE 传输都支持自定义 Headers 进行认证：

```python
{
    "server": {
        "url": "http://localhost:8000/mcp",
        "transport": "http",
        "headers": {
            "Authorization": "Bearer sk-xxx",
            "X-API-Key": "key-xxx",
            "X-Custom-Header": "value"
        }
    }
}
```

## 迁移指南

### 从 SSE 迁移到 HTTP

如果你的 MCP Server 使用旧的 SSE 传输：

1. **检查 MCP Server 版本**: 确认是否支持 `http` 传输
2. **更新配置**: 将 `transport: "sse"` 改为 `transport: "http"`
3. **测试连接**: 使用测试功能验证连接
4. **监控**: 观察性能和稳定性

### FastMCP 示例

使用 FastMCP 创建支持 HTTP 传输的 MCP Server：

```python
from fastmcp import FastMCP

mcp = FastMCP("MyServer")

@mcp.tool()
def my_tool(arg: str) -> str:
    """My tool description."""
    return f"Result: {arg}"

if __name__ == "__main__":
    # 使用 streamable-http (即 http 传输)
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```

## 性能对比

根据社区反馈和测试：

| 传输类型 | 延迟 | 吞吐量 | 稳定性 | 推荐度 |
|---------|------|--------|--------|--------|
| HTTP | 低 | 高 | 高 | ⭐⭐⭐⭐⭐ |
| SSE | 中 | 中 | 中 | ⭐⭐ (已弃用) |
| stdio | 极低 | 极高 | 高 | ⭐⭐⭐⭐ (仅本地) |

## 故障排查

### HTTP 连接失败
- 检查 URL 是否正确
- 确认 MCP Server 支持 `http` 传输
- 检查防火墙和网络配置
- 验证 Headers 配置 (特别是认证信息)

### SSE 连接问题
- 考虑迁移到 `http` 传输
- 检查 MCP Server 是否仍支持 SSE
- 查看服务器日志获取详细错误

### stdio 进程启动失败
- 检查 command 路径是否正确
- 验证 args 参数
- 确认环境变量配置
- 检查进程权限

## 参考资料

- [LangChain MCP 文档](https://docs.langchain.com/oss/python/langchain/mcp)
- [MCP 协议规范](https://modelcontextprotocol.io)
- [为什么 MCP 弃用 SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [Streamable HTTP 详解](https://harrylaou.com/llm/understanding-mcp-connection-options-technical-deep-dive/)

## 总结

- **生产环境**: 使用 `http` 传输 (默认)
- **本地开发**: 可以使用 `stdio` 传输
- **兼容旧版**: 仅在必要时使用 `sse` 传输
- **认证**: HTTP 和 SSE 都支持自定义 Headers
- **性能**: HTTP 传输提供最佳的性能和稳定性

我们的实现默认使用 `http` 传输，这是 MCP 协议的最新标准，也是生产环境的最佳选择。
