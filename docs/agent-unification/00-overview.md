# Agent 与 SubAgent 统一抽象 — 实施总览

## 1. 项目目标

将 Agent 和 SubAgent 统一为同一个数据模型（`agent` 表），通过关联表 `agent_subagent` 实现 Agent 间的"挂载"关系。核心收益：

- **SubAgent 获得 Agent 的全部能力**：MCP Servers、Skills、Memory、版本管理、独立会话等
- **Agent 可跨父级复用**：同一个 Agent 可被多个父 Agent 挂载为 SubAgent
- **统一用户心智模型**：只有"Agent"一个概念，通过"挂载"操作组合

## 2. 现状问题（SubAgent 缺失的能力）

| 能力 | Agent ✅ | SubAgent ❌ |
|------|---------|------------|
| model_provider | ✅ | ❌ 无法使用不同 provider |
| temperature / max_tokens | ✅ | ❌ 无法微调参数 |
| skills / memory_files | ✅ | ❌ 无法加载知识 |
| summarization_config | ✅ | ❌ 无法独立摘要 |
| metadata | ✅ | ❌ 无扩展元数据 |
| MCP Servers (独立表) | ✅ | ❌ 无法连接外部工具 |
| 版本管理 (AgentVersion) | ✅ | ❌ 仅 JSON 快照 |
| Session 关联 | ✅ | ❌ 不能独立对话 |
| 独立 CRUD API | ✅ 5 个端点 | ❌ 嵌套在 Agent API 中 |
| 运行时 MCP 工具加载 | ✅ `_get_mcp_tools()` | ❌ 仅 `ToolRegistry` |

## 3. 目标架构

```
┌──────────────────────────────────────────┐
│              agent 表 (统一)              │
│  id, name, description, model,           │
│  model_provider, system_prompt,          │
│  temperature, max_tokens, tools,         │
│  skills, memory_files,                   │
│  summarization_config, metadata          │
└──────────────────────────────────────────┘
        │                    │
        │ 1:N               │ 1:N
        ▼                    ▼
┌───────────────┐   ┌───────────────────┐
│ agent_subagent │   │ agent_mcp_server  │
│ (挂载关联表)    │   │ (已有, 不变)       │
│ parent_id (FK)│   └───────────────────┘
│ child_id  (FK)│
│ description   │  ← 挂载时的角色描述 (覆盖子 Agent 的通用 description)
│ sort_order    │
└───────────────┘
```

### 关键设计决策

1. **`description` 字段双层语义**：
   - `agent.description`：Agent 的通用能力描述
   - `agent_subagent.mount_description`：在特定父 Agent 上下文中的角色定位（可选覆盖）

2. **循环引用防护**：挂载时进行 DAG 环路检测

3. **MCP 工具运行时透传**：SubAgent 运行时也通过 `MCPClientManager` 加载自己的 MCP 工具

4. **向后兼容**：Agent 创建 API 保留内联 `subagents` 字段（快速创建模式），同时新增独立挂载 API

## 4. 实施步骤索引

| 步骤 | 文件 | 内容 | 影响范围 |
|------|------|------|---------|
| Step 1 | [01-database-migration.md](./01-database-migration.md) | 数据库 Schema 变更 + Alembic 迁移 | DB |
| Step 2 | [02-model-layer.md](./02-model-layer.md) | ORM Model 层改造 | `app/db/model/` |
| Step 3 | [03-schema-layer.md](./03-schema-layer.md) | Pydantic Schema 层改造 | `app/schema/` |
| Step 4 | [04-service-layer.md](./04-service-layer.md) | AgentService CRUD + 挂载逻辑 | `app/service/` |
| Step 5 | [05-agent-factory.md](./05-agent-factory.md) | AgentFactory 配置构建改造 | `app/agent/` |
| Step 6 | [06-deep-agent-service.md](./06-deep-agent-service.md) | DeepAgentService 运行时改造 | `app/agent/` |
| Step 7 | [07-api-routes.md](./07-api-routes.md) | API 路由层改造 | `app/api/` |
| Step 8 | [08-data-migration.md](./08-data-migration.md) | 历史数据迁移脚本 | `alembic/` |
| Step 9 | [09-frontend-guide.md](./09-frontend-guide.md) | 前端适配指南 | Frontend |

## 5. 文件变更总览

```
修改文件:
  app/db/model/agent.py          ← 新增 description, mounted_subagents 关系
  app/db/model/__init__.py       ← 导出新模型
  app/schema/agent.py            ← 重构 Schema, 新增挂载 Schema
  app/service/agent.py           ← 新增挂载/卸载/环路检测方法
  app/agent/agent_factory.py     ← build_agent_config() 适配关联表
  app/agent/deep_agent_service.py ← _build_subagent_middleware() 支持 MCP
  app/api/agent.py               ← 新增挂载 API 端点

新增文件:
  app/db/model/agent_subagent.py ← 关联表 ORM 模型
  alembic/versions/xxxx_unify_agent_subagent.py ← 迁移脚本

废弃文件:
  app/db/model/subagent.py       ← 迁移完成后废弃
```

## 6. 风险评估

| 风险 | 等级 | 缓解方案 |
|------|------|---------|
| 循环引用 | 中 | 挂载时递归 DAG 检测 |
| 数据迁移失败 | 低 | 迁移脚本可回滚, subagent 表延迟删除 |
| 前端适配工作量 | 中 | 保留内联创建模式兼容旧前端 |
| SubAgent MCP 工具加载性能 | 低 | 复用现有 MCPClientManager 缓存机制 |
| 共享 Agent 被修改影响多个父级 | 低 | 这是预期行为（统一升级），需前端提示 |
