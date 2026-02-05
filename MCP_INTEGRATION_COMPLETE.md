# MCP 集成实施完成

## 实施概览

已按照 `docs/mcp-integration` 文档完成 MCP (Model Context Protocol) 集成，使 Agent 能够动态连接外部 MCP Server 并使用第三方工具。

## 已完成的工作

### 1. 依赖和配置 ✅

- ✅ 添加 `langchain-mcp-adapters>=0.1.0` 依赖到 `pyproject.toml`
- ✅ 在 `app/config/__init__.py` 添加 MCP 相关配置项:
  - `MCP_CLIENT_TIMEOUT`: 30秒
  - `MCP_CONNECTION_TIMEOUT`: 10秒
  - `MCP_MAX_RETRIES`: 3次
  - `MCP_TOOL_CACHE_TTL`: 300秒
  - `MCP_MAX_SERVERS_PER_AGENT`: 10个

### 2. 数据库 Schema ✅

- ✅ 创建 `AgentMcpServer` 模型 (`app/db/model/agent_mcp_server.py`)
- ✅ 在 `Agent` 模型添加 `mcp_servers` relationship
- ✅ 创建数据库迁移 `a1b2c3d4e5f6_add_agent_mcp_server.py`
- ✅ 运行迁移成功

### 3. MCP Client Manager ✅

- ✅ 实现 `MCPClientManager` 核心服务 (`app/agent/mcp/client_manager.py`)
  - 工具缓存机制 (TTL 5分钟)
  - 连接管理和健康检查
  - 优雅降级 (单个 Server 失败不影响整体)
- ✅ 实现 `MCPToolCache` 工具缓存类
- ✅ 提供全局单例 `get_mcp_client_manager()`

### 4. Agent 集成 ✅

- ✅ 更新 `AgentFactory.build_agent_config()` 传递 MCP Server 配置
- ✅ 更新 `AgentFactory.clear_cache()` 同时清除 MCP 工具缓存
- ✅ 修改 `DeepAgentService._get_agent()` 为异步方法
- ✅ 实现 `DeepAgentService._get_mcp_tools()` 获取 MCP 工具
- ✅ 实现 `DeepAgentService._merge_tools()` 合并内置和 MCP 工具
- ✅ 更新所有调用方添加 `await`

### 5. Backend API ✅

- ✅ 创建 `McpServerService` CRUD 服务 (`app/service/mcp_server.py`)
- ✅ 创建 MCP Server Router (`app/router/v1/mcp_server.py`)
  - `GET /agents/{id}/mcp-servers` - 列出配置
  - `POST /agents/{id}/mcp-servers` - 添加配置
  - `GET /agents/{id}/mcp-servers/{server_id}` - 获取详情
  - `PUT /agents/{id}/mcp-servers/{server_id}` - 更新配置
  - `DELETE /agents/{id}/mcp-servers/{server_id}` - 删除配置
  - `POST /agents/{id}/mcp-servers/test` - 测试连接
- ✅ 注册路由到 `app/router/v1/__init__.py`
- ✅ 创建 Schema (`app/schema/mcp_server.py`)
  - 敏感 header 值自动脱敏

### 6. Frontend API ✅

- ✅ 创建类型定义 (`frontend/src/types/mcpServer.ts`)
- ✅ 创建 API 客户端 (`frontend/src/lib/mcpServerApi.ts`)
- ✅ 更新 `Agent` 类型添加 `mcp_servers` 字段

### 7. Frontend UI ✅

- ✅ 创建 `MCPServerConfig` 组件 (`frontend/src/components/MCPServerConfig.tsx`)
  - MCP Server 列表展示
  - 添加/删除 MCP Server
  - 启用/禁用切换
  - 连接测试功能
  - 工具列表展示

### 8. 测试 ✅

- ✅ 创建集成测试 (`test_mcp_integration.py`)
  - CRUD 操作测试
  - Header 脱敏测试

## 核心特性

### 1. 无状态 HTTP 连接
- 使用 `streamable-http` 传输方式
- 每次工具调用独立执行
- 适合生产环境部署

### 2. 工具缓存
- 默认 5 分钟 TTL
- 避免每次对话都请求 MCP Server
- Agent 配置变更时自动清除缓存

### 3. 优雅降级
- 单个 MCP Server 失败不影响其他 Server
- MCP Server 不可用时 Agent 仍可使用内置工具
- 详细的错误日志记录

### 4. 安全性
- API 响应中敏感 header 值自动脱敏
- 支持自定义 HTTP Headers (如 Authorization)
- 每个 Agent 最多 10 个 MCP Server

### 5. 工具合并策略
- 内置工具优先
- MCP 工具与内置工具同名时跳过
- 防止工具名称冲突

## 使用示例

### 1. 添加 MCP Server (API)

```bash
POST /api/v1/agents/{agent_id}/mcp-servers
{
  "name": "database-tools",
  "description": "PostgreSQL database query tools",
  "url": "http://localhost:8000/mcp",
  "headers": {
    "Authorization": "Bearer token-xxx"
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
    "Authorization": "Bearer token-xxx"
  }
}
```

### 3. Agent 对话中使用 MCP 工具

配置好 MCP Server 后，Agent 会自动加载 MCP 工具。LLM 可以像使用内置工具一样调用 MCP 工具。

## 架构图

```
Frontend (React)
    ↓ REST API
Backend (FastAPI)
    ├─ AgentFactory → build_agent_config (包含 mcp_servers)
    ├─ DeepAgentService
    │   ├─ 内置工具 (ToolRegistry)
    │   └─ MCP 工具 (MCPClientManager)
    └─ MCPClientManager
        ↓ HTTP/SSE
    MCP Servers (外部)
```

## 数据流

1. **Agent 创建/更新**: 用户配置 MCP Server → API 保存到数据库 → AgentFactory 清除缓存
2. **Agent 对话**: 
   - 用户发消息
   - DeepAgentService 获取内置工具 + MCP 工具
   - 合并工具列表
   - 创建 Agent 实例
   - LLM 决定调用工具
   - 返回结果

## 配置说明

### 环境变量 (.env)

```env
# MCP Configuration (可选，使用默认值即可)
MCP_CLIENT_TIMEOUT=30
MCP_CONNECTION_TIMEOUT=10
MCP_MAX_RETRIES=3
MCP_TOOL_CACHE_TTL=300
MCP_MAX_SERVERS_PER_AGENT=10
```

## 下一步

### 待完成的工作

1. **前端集成**: 将 `MCPServerConfig` 组件集成到 `AgentDialog` 的标签页中
2. **完整测试**: 
   - 使用真实 MCP Server 进行端到端测试
   - 测试工具调用流程
   - 测试 SSE streaming 中的 MCP 工具事件
3. **文档完善**: 
   - 用户使用指南
   - MCP Server 开发指南
   - 故障排查文档

### 可选增强

1. **并行获取工具**: 多个 MCP Server 并行获取工具列表
2. **工具命名空间**: 为 MCP 工具添加前缀避免冲突
3. **连接池**: 复用 HTTP 连接提高性能
4. **监控指标**: MCP Server 连接状态、工具调用统计
5. **UI 增强**: 
   - Headers 编辑器 (key-value pairs)
   - 工具详情展示 (input schema)
   - 连接历史记录

## 验证清单

- [x] 依赖安装成功
- [x] 数据库迁移成功
- [x] 模型和 Schema 定义正确
- [x] MCP Client Manager 实现完整
- [x] Agent 集成正确
- [x] Backend API 端点工作正常
- [x] Frontend API 客户端创建
- [x] Frontend UI 组件创建
- [ ] 端到端测试通过
- [ ] 文档完善

## 参考文档

- `docs/mcp-integration/00-overview.md` - 总览
- `docs/mcp-integration/01-dependencies.md` - 依赖
- `docs/mcp-integration/02-database-schema.md` - 数据库
- `docs/mcp-integration/03-mcp-client-service.md` - 核心服务
- `docs/mcp-integration/04-agent-integration.md` - Agent 集成
- `docs/mcp-integration/05-backend-api.md` - Backend API
- `docs/mcp-integration/06-frontend-api.md` - Frontend API
- `docs/mcp-integration/07-frontend-ui.md` - Frontend UI
- `docs/mcp-integration/08-testing.md` - 测试方案

## 技术栈

- **MCP SDK**: `langchain-mcp-adapters` 0.2.1
- **传输方式**: HTTP/SSE (streamable-http)
- **数据库**: PostgreSQL (agent_mcp_server 表)
- **缓存**: 内存缓存 + TTL
- **前端**: React + TypeScript

## 注意事项

1. MCP Server 必须支持 HTTP/SSE 传输方式
2. 工具缓存默认 5 分钟，可通过配置调整
3. 敏感信息 (API Key) 在响应中会被脱敏
4. Agent 配置变更后需要重新对话才会加载新的 MCP 工具
5. 单个 MCP Server 失败不会影响 Agent 的其他功能

## 故障排查

### MCP Server 连接失败
- 检查 URL 是否正确
- 检查 MCP Server 是否运行
- 检查网络连接
- 查看 `last_error` 字段获取详细错误信息

### 工具未加载
- 检查 MCP Server 是否启用 (`is_enabled=true`)
- 检查缓存是否过期 (修改配置后等待 5 分钟或重启服务)
- 查看日志确认工具获取过程

### 工具调用失败
- 检查 MCP Server 日志
- 确认工具参数格式正确
- 检查超时配置 (`MCP_CLIENT_TIMEOUT`)
