# DeepAgents Migration Overview

## Breaking Change Notice

本次迁移将从 `langgraph.prebuilt.create_react_agent` 切换到 `deepagents.create_deep_agent`，这是一个**破坏性变更**。

---

## DeepAgents 完整特性清单

### 1. 内置工具 (Built-in Tools)

使用 `create_deep_agent` 自动启用，无需配置：

| 工具 | 类别 | 说明 |
|------|------|------|
| `write_todos` | Planning | 创建和管理任务列表 |
| `read_todos` | Planning | 读取当前任务状态 |
| `ls` | Filesystem | 列出目录内容 |
| `read_file` | Filesystem | 读取文件内容 |
| `write_file` | Filesystem | 写入文件 |
| `edit_file` | Filesystem | 编辑文件（增量修改） |
| `glob` | Filesystem | 文件模式匹配 |
| `grep` | Filesystem | 内容搜索 |
| `task` | SubAgent | 委派任务给子代理 |
| `execute` | Shell | 沙盒化 shell 命令执行 |

### 2. 中间件系统 (Middleware)

| 中间件 | 功能 |
|--------|------|
| `TodoListMiddleware` | 任务规划和进度跟踪 |
| `FilesystemMiddleware` | 虚拟文件系统，上下文管理 |
| `SubAgentMiddleware` | 子代理生成，上下文隔离 |
| `SkillsMiddleware` | 可复用工作流 |
| `MemoryMiddleware` | 持久化项目上下文 |
| `Custom Middleware` | 自定义工具和钩子 |

### 3. 后端系统 (Backend)

| 后端 | 用途 |
|------|------|
| `StateBackend` | 临时状态存储（对话结束后清除） |
| `StoreBackend` | 持久化存储（跨对话保留） |
| `FilesystemBackend` | 真实文件系统访问 |
| `CompositeBackend` | 混合路由，按路径分发到不同后端 |

**路由示例：**
```python
CompositeBackend(
    default=lambda rt: StateBackend(rt),          # 默认：临时存储
    routes={"/memories/": lambda rt: StoreBackend(rt)}  # /memories/* → 持久化
)
```

### 4. 技能系统 (Skills)

目录结构：
```
/skills/
├── web-research/
│   ├── SKILL.md      # YAML 前言 + 指令
│   └── helper.py     # 可选支持文件
└── code-review/
    └── SKILL.md
```

**SKILL.md 格式：**
```yaml
---
name: web-research
description: Conduct thorough web research
triggers:
  - research
  - investigate
---
# Instructions
1. Use web_search to gather information
2. Save findings to research_[topic]/findings.md
```

### 5. 记忆系统 (Memory)

**AGENTS.md 文件：** 提供持久化项目上下文
```
~/.deepagents/AGENTS.md     # 全局偏好
./.deepagents/AGENTS.md     # 项目特定上下文
```

**长期记忆路由：**
- `/memories/*` → 持久化存储，跨对话保留
- 其他路径 → 临时存储，对话结束后清除

---

## 实现状态对比

### ✅ 已实现

| 特性 | 状态 | 说明 |
|------|------|------|
| Agent 数据模型 | ✅ 完成 | model, model_provider, temperature, max_tokens, tools |
| SubAgent 数据模型 | ✅ 完成 | 独立表，外键关联 |
| AgentVersion 版本历史 | ✅ 完成 | 配置变更追踪 |
| PostgreSQL Checkpointer | ✅ 完成 | 对话状态持久化 |
| InMemoryStore | ✅ 完成 | 内存存储 |
| 自定义工具注册 | ✅ 完成 | ToolRegistry |
| 流式响应 | ✅ 完成 | SSE 事件 |
| 模型提供商支持 | ✅ 完成 | `provider:model` 格式 |

### ❌ 未实现

| 特性 | 优先级 | 说明 |
|------|--------|------|
| `create_deep_agent` | **P0** | 仍在使用 `create_react_agent` |
| 内置文件系统工具 | **P0** | ls, read_file, write_file, edit_file, glob, grep |
| Planning 工具 | **P0** | write_todos, read_todos |
| `task` 工具 (SubAgent 委派) | **P1** | 运行时子代理生成 |
| CompositeBackend | **P1** | 混合存储路由 |
| FilesystemBackend | **P2** | 真实文件系统访问 |
| 中间件系统 | **P2** | TodoList, Filesystem, SubAgent 中间件 |
| Skills 系统 | **P3** | SKILL.md 工作流 |
| Memory 系统 | **P3** | AGENTS.md 项目上下文 |
| Execute 工具 | **P3** | 沙盒化 shell 执行 |

---

## 架构对比

### 当前实现 (create_react_agent)

```
┌─────────────────────────────────────────┐
│           DeepAgentService              │
├─────────────────────────────────────────┤
│  create_react_agent                     │
│  ├── ChatOpenAI / init_chat_model       │
│  ├── Custom Tools (ToolRegistry)        │
│  ├── AsyncPostgresSaver (checkpointer)  │
│  └── InMemoryStore (store)              │
└─────────────────────────────────────────┘
```

### 目标实现 (create_deep_agent)

```
┌─────────────────────────────────────────────────────────┐
│                   DeepAgentService                      │
├─────────────────────────────────────────────────────────┤
│  create_deep_agent                                      │
│  ├── Model (init_chat_model)                            │
│  ├── Built-in Tools                                     │
│  │   ├── Planning: write_todos, read_todos              │
│  │   ├── Filesystem: ls, read, write, edit, glob, grep  │
│  │   └── SubAgent: task                                 │
│  ├── Custom Tools (ToolRegistry)                        │
│  ├── Middleware                                         │
│  │   ├── TodoListMiddleware                             │
│  │   ├── FilesystemMiddleware                           │
│  │   ├── SubAgentMiddleware                             │
│  │   └── Custom Middleware                              │
│  ├── Backend                                            │
│  │   └── CompositeBackend                               │
│  │       ├── StateBackend (default)                     │
│  │       └── StoreBackend (/memories/)                  │
│  ├── SubAgents                                          │
│  │   └── [name, description, tools, model]              │
│  ├── Checkpointer (AsyncPostgresSaver)                  │
│  └── Store (InMemoryStore / PostgresStore)              │
└─────────────────────────────────────────────────────────┘
```

---

## 文件变更范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `app/config.py` | ✅ Minor | 新增 `AGENT_DEFAULT_PROVIDER` |
| `app/db/model/agent.py` | ✅ Done | 新增配置列 |
| `app/db/model/subagent.py` | ✅ Done | 新建 SubAgent 表 |
| `app/db/model/agent_version.py` | ✅ Done | 新建版本历史表 |
| `app/schema/session.py` | ✅ Done | 更新 Agent/SubAgent Schema |
| `app/agent/deep_agent_service.py` | ⚠️ Partial | 需切换到 `create_deep_agent` |
| `app/agent/factory.py` | ✅ Done | 添加 `build_agent_config` |
| `alembic/env.py` | ✅ Done | 排除 checkpoint 表 |

---

## 依赖要求

```toml
# pyproject.toml - 已安装
deepagents = "^0.3.8"
langchain = "^0.3.0"
langgraph = "^0.2.0"
```
