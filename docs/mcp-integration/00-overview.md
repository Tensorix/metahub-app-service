# MCP 集成方案 - 总览

## 目标

为 metahub-app-service 的 Agent 系统集成 MCP (Model Context Protocol) Client 能力，使每个 Agent 能够动态连接外部 MCP Server，获取并使用第三方工具（如数据库查询、文件系统操作、API 调用等），扩展 Agent 的工具能力。

## 决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| MCP 角色 | 仅 Client | Agent 消费外部 MCP Server 的工具，扩展能力 |
| 配置粒度 | Agent 级别 | 每个 Agent 独立配置 MCP Server 列表 |
| 传输方式 | 仅 HTTP/SSE | 适合生产部署的 Web 服务架构 |
| 前端需求 | 完整管理界面 | AgentDialog 中添加 MCP Server 配置标签页 |

## 技术栈

- **核心库**: `langchain-mcp-adapters` - LangChain 官方 MCP 适配器
- **MCP SDK**: `mcp` - 底层 MCP 协议实现（作为 langchain-mcp-adapters 的依赖自动安装）
- **现有集成点**: `langchain-core`, `langgraph`, `deepagents`

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                   │
│  ┌─────────────────────────────────────────────┐    │
│  │  AgentDialog → MCP Servers 标签页             │    │
│  │  - 添加/编辑/删除 MCP Server 配置             │    │
│  │  - 测试连接 / 查看可用工具                     │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                   Backend (FastAPI)                   │
│                                                      │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  Agent Router │  │  MCP Router (新增)          │   │
│  │  /agents/     │  │  /agents/{id}/mcp-servers/ │   │
│  └──────┬───────┘  └────────────┬───────────────┘   │
│         │                       │                    │
│  ┌──────▼───────────────────────▼───────────────┐   │
│  │          Agent Service Layer                   │   │
│  │  ┌─────────────────────────────────────────┐  │   │
│  │  │  DeepAgentService                        │  │   │
│  │  │  - 内置工具 (ToolRegistry)               │  │   │
│  │  │  - MCP 工具 (MCPClientManager) ← 新增    │  │   │
│  │  └─────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │          MCPClientManager (新增)               │   │
│  │  - MultiServerMCPClient 封装                  │   │
│  │  - 连接生命周期管理                            │   │
│  │  - 工具发现与缓存                              │   │
│  │  - 健康检查                                    │   │
│  └──────────────────────────────────────────────┘   │
│                       │                              │
│              HTTP/SSE Transport                       │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │MCP Server│   │MCP Server│   │MCP Server│
   │(Database)│   │(Weather) │   │(Custom)  │
   └─────────┘   └─────────┘   └─────────┘
```

## 数据流

### Agent 创建/更新时
```
用户配置 MCP Server → API 保存到数据库 → AgentFactory 清除缓存
```

### Agent 对话时
```
用户发消息
  → DeepAgentService._get_agent()
    → MCPClientManager.get_tools(agent_id)  ← 新增
      → MultiServerMCPClient.get_tools()
      → 转换为 LangChain BaseTool
    → 合并 ToolRegistry 内置工具 + MCP 工具
    → create_deep_agent(tools=合并后的工具列表)
  → LLM 决定调用某个 MCP 工具
    → MCPClientManager 代理执行
    → 返回结果给 LLM
```

## 实现步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 01 | `01-dependencies.md` | 依赖安装与配置项 |
| 02 | `02-database-schema.md` | 数据库 Schema 变更 |
| 03 | `03-mcp-client-service.md` | MCPClientManager 核心服务 |
| 04 | `04-agent-integration.md` | 与 DeepAgentService 集成 |
| 05 | `05-backend-api.md` | REST API 端点设计 |
| 06 | `06-frontend-api.md` | 前端 API 客户端 |
| 07 | `07-frontend-ui.md` | 前端 UI 组件 |
| 08 | `08-testing.md` | 测试与验证方案 |

## 文件变更预览

### 新增文件
```
app/
  agent/
    mcp/
      __init__.py
      client_manager.py     # MCPClientManager 核心服务
      schemas.py             # MCP 相关 Pydantic 模型
  router/v1/
    mcp_server.py            # MCP Server 管理 API
  service/
    mcp_server.py            # MCP Server CRUD 服务

frontend/src/
  lib/
    mcpServerApi.ts          # MCP Server API 客户端
  components/
    MCPServerConfig.tsx       # MCP Server 配置组件

alembic/versions/
  xxx_add_mcp_servers.py     # 数据库迁移
```

### 修改文件
```
pyproject.toml               # 添加 langchain-mcp-adapters 依赖
app/config.py                # 添加 MCP 相关配置项
app/db/model/agent.py        # Agent 模型添加 mcp_servers 字段
app/schema/agent.py          # Agent Schema 添加 MCP 配置
app/agent/factory.py         # build_agent_config 传递 MCP 配置
app/agent/deep_agent_service.py  # 集成 MCPClientManager
app/router/v1/__init__.py    # 注册 MCP 路由
frontend/src/components/AgentDialog.tsx  # 添加 MCP 标签页
```
