# DeepAgents 迁移完成报告

## 概述

已成功完成从 `langgraph.prebuilt.create_react_agent` 到 `deepagents.create_deep_agent` 的迁移。

**迁移日期**: 2026-01-26  
**状态**: ✅ 完成

---

## 已实现功能

### ✅ P0 - 核心迁移

| 功能 | 状态 | 说明 |
|------|------|------|
| `create_deep_agent` | ✅ | 已切换到 deepagents 库 |
| 内置工具 | ✅ | 自动启用：write_todos, read_todos, ls, read_file, write_file, edit_file, glob, grep |
| SubAgentMiddleware | ✅ | 支持子代理委派和上下文隔离 |
| 模型提供商支持 | ✅ | 支持 `provider:model` 格式 |

### ✅ P1 - 后端系统

| 功能 | 状态 | 说明 |
|------|------|------|
| CompositeBackend | ✅ | 混合存储路由 |
| StateBackend | ✅ | 临时状态存储（对话结束后清除） |
| StoreBackend | ✅ | 持久化存储（`/memories/*` 路径） |
| PostgreSQL Checkpointer | ✅ | 对话状态持久化 |
| InMemoryStore | ✅ | 内存存储 |

### ✅ P2 - 扩展功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Skills 系统 | ✅ | 通过 `skills` 参数支持 SKILL.md 工作流 |
| Memory 系统 | ✅ | 通过 `memory` 参数支持 AGENTS.md 上下文 |
| 自定义工具 | ✅ | ToolRegistry 集成 |
| 流式响应 | ✅ | SSE 事件流 |

---

## 文件变更清单

### 核心文件

#### 1. `app/agent/deep_agent_service.py` ✅
- 切换到 `create_deep_agent`
- 实现 `_build_backend()` - CompositeBackend 路由
- 实现 `_build_subagent_middleware()` - 子代理支持（添加 default_model 参数）
- 添加 Skills 和 Memory 配置支持
- 完整的流式响应实现

#### 2. `app/agent/factory.py` ✅
- 更新 `build_agent_config()` 添加 `name` 字段
- 从数据库字段直接读取 `skills` 和 `memory_files`（不再从 metadata 读取）
- 支持 SubAgent 配置转换

#### 3. `app/config.py` ✅
- 已有 `AGENT_DEFAULT_MODEL` = "gpt-4o-mini"
- 已有 `AGENT_DEFAULT_PROVIDER` = "openai"

#### 4. `pyproject.toml` ✅
- 添加 `deepagents>=0.3.8` 依赖
- 添加 `pytest-asyncio>=0.24.0` 测试依赖
- 配置 pytest asyncio 模式

### 数据模型

#### 5. `app/db/model/agent.py` ✅
- 添加 `skills` 字段（JSONB，技能目录路径列表）
- 添加 `memory_files` 字段（JSONB，记忆文件路径列表）
- 已有完整的 DeepAgents 配置字段
- 支持 model, model_provider, temperature, max_tokens, tools

#### 6. `app/db/model/subagent.py` ✅
- 独立的 SubAgent 表
- 外键关联到 Agent
- 支持 name, description, system_prompt, model, tools

#### 7. `app/db/model/agent_version.py` ✅
- 配置变更历史追踪

### Schema 定义

#### 8. `app/schema/session.py` ✅
- `AgentBase` 添加 `skills` 和 `memory_files` 字段
- `AgentCreate` 继承新字段
- `AgentUpdate` 支持更新新字段
- `AgentResponse` 返回新字段

### 服务层

#### 9. `app/service/session.py` ✅
- `create_agent()` 支持创建 skills 和 memory_files
- `create_agent()` 支持创建 subagents
- 导入 SubAgent 模型

### 路由层

#### 10. `app/router/v1/agent_chat.py` ✅
- 使用 `AgentFactory.build_agent_config(agent)` 替代 `agent.metadata_`
- 两处修改：HTTP 端点和 WebSocket 端点

### 数据库迁移

#### 11. `alembic/versions/9bdd44968ec6_add_skills_and_memory_files_to_agent.py` ✅
- 添加 `skills` 列到 agent 表
- 添加 `memory_files` 列到 agent 表
- 提供 upgrade 和 downgrade 方法

---

## 架构对比

### 迁移前 (create_react_agent)

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

### 迁移后 (create_deep_agent)

```
┌─────────────────────────────────────────────────────────┐
│                   DeepAgentService                      │
├─────────────────────────────────────────────────────────┤
│  create_deep_agent                                      │
│  ├── Model (init_chat_model)                            │
│  ├── Built-in Tools                                     │
│  │   ├── Planning: write_todos, read_todos              │
│  │   ├── Filesystem: ls, read, write, edit, glob, grep  │
│  │   └── SubAgent: task (if configured)                 │
│  ├── Custom Tools (ToolRegistry)                        │
│  ├── Middleware                                         │
│  │   └── SubAgentMiddleware (if configured)             │
│  ├── Backend                                            │
│  │   └── CompositeBackend                               │
│  │       ├── StateBackend (default)                     │
│  │       └── StoreBackend (/memories/)                  │
│  ├── Checkpointer (AsyncPostgresSaver)                  │
│  └── Store (InMemoryStore)                              │
└─────────────────────────────────────────────────────────┘
```

---

## 内置工具清单

### Planning Tools (自动启用)
- `write_todos` - 创建和管理任务列表
- `read_todos` - 读取当前任务状态

### Filesystem Tools (自动启用)
- `ls` - 列出目录内容
- `read_file` - 读取文件内容
- `write_file` - 写入文件
- `edit_file` - 编辑文件（增量修改）
- `glob` - 文件模式匹配
- `grep` - 内容搜索

### SubAgent Tools (条件启用)
- `task` - 委派任务给子代理（需要配置 subagents）

---

## 存储路由策略

### CompositeBackend 路由规则

```python
CompositeBackend(
    default=lambda rt: StateBackend(rt),          # 默认：临时存储
    routes={"/memories/": lambda rt: StoreBackend(rt)}  # /memories/* → 持久化
)
```

| 路径模式 | 后端 | 生命周期 | 用途 |
|---------|------|---------|------|
| `/memories/*` | StoreBackend | 跨对话持久化 | 长期记忆、用户偏好 |
| 其他路径 | StateBackend | 对话结束后清除 | 临时状态、工作文件 |

---

## 测试验证

### 测试文件
- `tests/agent/test_deepagents_migration.py` ✅

### 测试覆盖

| 测试用例 | 状态 | 说明 |
|---------|------|------|
| test_model_string_formatting | ✅ | 模型字符串格式化 |
| test_backend_creation | ✅ | CompositeBackend 创建 |
| test_subagent_middleware_creation | ✅ | SubAgentMiddleware 创建 |
| test_factory_build_agent_config | ✅ | 配置构建 |
| test_agent_initialization | ✅ | Agent 初始化 |
| test_chat_method_signature | ✅ | chat 方法签名 |
| test_chat_stream_method_signature | ✅ | chat_stream 方法签名 |
| test_built_in_tools_documented | ✅ | 内置工具文档 |
| test_agent_with_skills_field | ✅ | Agent skills 字段 |
| test_agent_with_memory_files_field | ✅ | Agent memory_files 字段 |
| test_build_agent_config_with_skills | ✅ | 配置构建包含 skills |
| test_build_agent_config_with_memory_files | ✅ | 配置构建包含 memory |
| test_build_agent_config_complete | ✅ | 完整配置构建 |

### 运行测试

```bash
# 运行迁移测试
PYTHONPATH=. uv run pytest tests/agent/test_deepagents_migration.py -v

# 运行字段测试
PYTHONPATH=. uv run pytest tests/agent/test_agent_fields.py -v

# 运行所有 agent 测试
PYTHONPATH=. uv run pytest tests/agent/ -v
```

**结果**: 所有测试通过

---

## 配置示例

### 基础 Agent 配置

```python
agent_config = {
    "name": "my-agent",
    "model": "gpt-4o-mini",
    "model_provider": "openai",
    "system_prompt": "You are a helpful assistant.",
    "temperature": 0.7,
    "max_tokens": 4096,
    "tools": ["calculator", "search"],
}
```

### 带 SubAgent 的配置

```python
agent_config = {
    "name": "main-agent",
    "model": "gpt-4o-mini",
    "model_provider": "openai",
    "system_prompt": "You are a project manager.",
    "tools": [],
    "subagents": [
        {
            "name": "researcher",
            "description": "Research specialist for gathering information",
            "system_prompt": "You are a research expert.",
            "model": "gpt-4o",  # Optional, can use different model
            "tools": ["search", "web_scraper"],
        },
        {
            "name": "coder",
            "description": "Code generation and debugging specialist",
            "system_prompt": "You are a coding expert.",
            "tools": ["code_analyzer"],
        }
    ]
}
```

### 带 Skills 和 Memory 的配置

```python
agent_config = {
    "name": "advanced-agent",
    "model": "gpt-4o-mini",
    "model_provider": "openai",
    "system_prompt": "You are an advanced assistant.",
    "tools": [],
    "skills": ["./skills/research/", "./skills/coding/"],
    "memory_files": ["./AGENTS.md", "~/.deepagents/AGENTS.md"],
}
```

**注意**: `skills` 和 `memory_files` 现在是数据库字段，不再存储在 metadata 中。

---

## API 使用示例

### 非流式对话

```python
from app.agent.factory import AgentFactory

# 创建 agent
agent = await AgentFactory.create_agent(
    agent_id=agent_id,
    agent_config=agent_config,
)

# 发送消息
response = await agent.chat(
    message="Hello, what can you do?",
    thread_id="thread-123",
    user_id=user_id,
)

print(response)
```

### 流式对话

```python
# 流式响应
async for event in agent.chat_stream(
    message="List files in current directory",
    thread_id="thread-123",
    user_id=user_id,
):
    event_type = event["event"]
    event_data = event["data"]
    
    if event_type == "message":
        print(event_data["content"], end="", flush=True)
    elif event_type == "tool_call":
        print(f"\n[Tool: {event_data['name']}]")
    elif event_type == "tool_result":
        print(f"[Result: {event_data['result'][:100]}...]")
    elif event_type == "done":
        print("\n[Complete]")
```

---

## 未来扩展 (可选)

### P3 - 高级功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| FilesystemBackend | P3 | 真实文件系统访问 |
| SummarizationMiddleware | P3 | 对话摘要 |
| Execute 工具 | P3 | 沙盒化 shell 执行 |
| 结构化输出 | P3 | response_format 参数 |
| 人机交互 | P3 | interrupt_on 配置 |

---

## 兼容性说明

### 依赖版本

```toml
deepagents = "^0.3.8"
langchain = "^0.3.0"
langgraph = "^0.2.0"
langgraph-checkpoint-postgres = "^0.2.0"
```

### Python 版本
- 要求: Python >= 3.13
- 测试: Python 3.14.0rc1

### 数据库
- PostgreSQL (用于 checkpointer)
- 需要运行 Alembic 迁移

---

## 回滚计划

如果需要回滚到旧版本：

1. **恢复代码**
   ```bash
   git checkout <previous-commit> -- app/agent/deep_agent_service.py
   git checkout <previous-commit> -- app/agent/factory.py
   ```

2. **降级依赖**
   ```bash
   uv pip uninstall deepagents
   ```

3. **重启服务**
   ```bash
   uv run uvicorn app.main:app --reload
   ```

---

## 总结

✅ **迁移成功完成**

- 所有核心功能已实现
- 所有测试通过
- 向后兼容现有 API
- 新增内置工具自动可用
- 支持子代理委派
- 支持持久化记忆
- 支持 Skills 和 Memory 系统

**下一步建议**:
1. 在开发环境进行集成测试
2. 验证流式响应和工具调用
3. 测试 SubAgent 功能
4. 考虑添加 Skills 工作流
5. 配置 Memory 文件以提供项目上下文
