# MCP 前端集成说明

## 配置位置

MCP Server 配置已集成到 **Agent 管理页面**的 **AgentDialog** 组件中。

### 访问路径

1. 打开前端应用
2. 导航到 **Agents** 页面 (`/agents`)
3. 点击 **创建 Agent** 或 **编辑** 现有 Agent
4. 在弹出的对话框中，点击 **MCP Servers** 标签页

## 标签页结构

AgentDialog 现在包含以下标签页:

1. **基础配置** - Agent 名称、模型、提示词、工具等
2. **高级功能** - Skills 和 Memory Files
3. **子代理** - SubAgent 配置
4. **MCP Servers** ⭐ **新增** - MCP Server 配置
5. **对话摘要** - 对话压缩配置

## MCP Servers 标签页功能

### 1. 添加 MCP Server

- 点击 **添加 MCP Server** 按钮
- 填写以下信息:
  - **名称** (必填): 例如 `database-tools`
  - **URL** (必填): MCP Server 地址，例如 `http://localhost:8000/mcp`
  - **描述** (可选): 功能说明
  - **Headers** (可选): 自定义 HTTP 头，如 Authorization

### 2. 测试连接

- 点击 MCP Server 卡片上的 **测试** 按钮
- 系统会连接到 MCP Server 并获取可用工具列表
- 显示连接状态:
  - ✅ **已连接** - 显示可用工具数量和延迟
  - ❌ **连接失败** - 显示错误信息

### 3. 启用/禁用

- 使用开关切换 MCP Server 的启用状态
- 禁用的 Server 不会加载工具

### 4. 删除 MCP Server

- 点击 **删除** 按钮
- 确认后删除配置

### 5. 查看工具列表

- 测试连接成功后，会显示该 MCP Server 提供的所有工具
- 每个工具显示名称和描述

## 使用流程

### 创建新 Agent 时

1. 填写基础配置
2. 切换到 **MCP Servers** 标签页
3. 添加 MCP Server 配置
4. 测试连接确保可用
5. 保存 Agent

**注意**: 新建 Agent 时，需要先保存 Agent 才能添加 MCP Server。

### 编辑现有 Agent 时

1. 打开 Agent 编辑对话框
2. 切换到 **MCP Servers** 标签页
3. 查看已配置的 MCP Servers
4. 添加、编辑或删除 MCP Server
5. 保存更改

## 界面预览

```
┌─────────────────────────────────────────────────────┐
│ 编辑 Agent                                      [X] │
├─────────────────────────────────────────────────────┤
│ [基础配置] [高级功能] [子代理] [MCP Servers (2)] [对话摘要] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  MCP Servers                    [+ 添加 MCP Server] │
│  配置外部 MCP Server 以扩展 Agent 的工具能力          │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ 🔌 database-tools          [启用] [测试] [删除] │ │
│  │ http://localhost:8000/mcp                     │ │
│  │ ● 已连接 · 3 个工具 · 延迟 156ms               │ │
│  │                                               │ │
│  │ PostgreSQL database query tools               │ │
│  │                                               │ │
│  │ 可用工具:                                      │ │
│  │ • query_database - Execute SQL queries        │ │
│  │ • list_tables - List all database tables      │ │
│  │ • describe_table - Get table schema           │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ 🔌 weather-api             [启用] [测试] [删除] │ │
│  │ http://weather-server:8080/mcp                │ │
│  │ ● 已连接 · 2 个工具 · 延迟 89ms                │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│                              [取消]  [保存]          │
└─────────────────────────────────────────────────────┘
```

## 技术实现

### 组件结构

```
AgentDialog
  └─ MCPServerConfig (MCP Servers 标签页内容)
      ├─ 添加表单
      ├─ MCP Server 列表
      │   └─ MCP Server 卡片
      │       ├─ 名称 + 启用开关
      │       ├─ URL
      │       ├─ 连接状态
      │       ├─ 工具列表
      │       └─ 操作按钮 (测试/删除)
      └─ 空状态提示
```

### 数据流

1. **加载**: Agent 数据包含 `mcp_servers` 字段
2. **编辑**: 通过 `MCPServerConfig` 组件管理
3. **保存**: MCP Server 配置自动随 Agent 一起保存
4. **测试**: 调用 `/agents/{id}/mcp-servers/test` API

### API 调用

```typescript
// 列出 MCP Servers
GET /api/v1/agents/{agent_id}/mcp-servers

// 添加 MCP Server
POST /api/v1/agents/{agent_id}/mcp-servers
{
  "name": "database-tools",
  "url": "http://localhost:8000/mcp",
  "is_enabled": true
}

// 测试连接
POST /api/v1/agents/{agent_id}/mcp-servers/test
{
  "url": "http://localhost:8000/mcp"
}

// 删除 MCP Server
DELETE /api/v1/agents/{agent_id}/mcp-servers/{server_id}
```

## 注意事项

1. **Agent 必须先保存**: 新建 Agent 时，需要先保存 Agent 才能添加 MCP Server
2. **连接测试**: 建议在保存前测试连接，确保 MCP Server 可用
3. **敏感信息**: Authorization 等敏感 header 值会在显示时自动脱敏
4. **缓存机制**: MCP 工具列表会缓存 5 分钟，修改配置后需要等待缓存过期或重启服务
5. **工具冲突**: 如果 MCP 工具与内置工具同名，内置工具优先

## 故障排查

### MCP Server 卡片不显示

- 检查 Agent 是否已保存
- 刷新页面重新加载数据

### 测试连接失败

- 检查 MCP Server URL 是否正确
- 检查 MCP Server 是否运行
- 检查网络连接
- 查看浏览器控制台错误信息

### 工具未在对话中生效

- 确认 MCP Server 已启用 (`is_enabled=true`)
- 等待工具缓存过期 (5分钟)
- 或重启后端服务清除缓存

## 相关文档

- `MCP_INTEGRATION_COMPLETE.md` - 完整实施文档
- `MCP_INTEGRATION_QUICKSTART.md` - 快速开始指南
- `frontend/src/components/MCPServerConfig.tsx` - 组件源码
- `frontend/src/lib/mcpServerApi.ts` - API 客户端
