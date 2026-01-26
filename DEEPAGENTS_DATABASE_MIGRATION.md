# DeepAgents 数据库迁移指南

## 概述

本文档说明如何应用数据库迁移，为 Agent 表添加 `skills` 和 `memory_files` 字段。

---

## 迁移内容

### 新增字段

| 字段名 | 类型 | 说明 | 可空 |
|--------|------|------|------|
| `skills` | JSONB | 技能目录路径列表 | 是 |
| `memory_files` | JSONB | 记忆文件路径列表 | 是 |

### 迁移文件

- **文件**: `alembic/versions/9bdd44968ec6_add_skills_and_memory_files_to_agent.py`
- **Revision ID**: `9bdd44968ec6`
- **Down Revision**: `62ce0e232e8b`

---

## 执行迁移

### 1. 检查当前数据库版本

```bash
uv run alembic current
```

**预期输出**:
```
62ce0e232e8b (head)
```

### 2. 查看待执行的迁移

```bash
uv run alembic history
```

应该能看到新的迁移：
```
9bdd44968ec6 -> 62ce0e232e8b, add_skills_and_memory_files_to_agent
```

### 3. 执行迁移

```bash
uv run alembic upgrade head
```

**预期输出**:
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade 62ce0e232e8b -> 9bdd44968ec6, add_skills_and_memory_files_to_agent
```

### 4. 验证迁移

```bash
uv run alembic current
```

**预期输出**:
```
9bdd44968ec6 (head)
```

### 5. 验证数据库结构

连接到数据库并检查 agent 表：

```sql
\d agent
```

应该能看到新增的列：
```
Column        | Type   | Nullable | Comment
--------------+--------+----------+-------------------------
skills        | jsonb  | YES      | 技能目录路径列表
memory_files  | jsonb  | YES      | 记忆文件路径列表
```

---

## 回滚迁移

如果需要回滚：

```bash
uv run alembic downgrade -1
```

这会删除 `skills` 和 `memory_files` 列。

---

## 数据迁移（可选）

如果之前在 `metadata_` 字段中存储了 skills 或 memory 配置，可以执行数据迁移：

### 迁移脚本

```python
# scripts/migrate_skills_memory.py
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.config import config
from app.db.model.agent import Agent

def migrate_skills_and_memory():
    """Migrate skills and memory from metadata_ to dedicated fields."""
    engine = create_engine(config.sqlalchemy_database_uri)
    
    with Session(engine) as session:
        agents = session.query(Agent).filter(Agent.is_deleted == False).all()
        
        migrated_count = 0
        for agent in agents:
            if not agent.metadata_:
                continue
            
            updated = False
            
            # Migrate skills
            if "skills" in agent.metadata_ and not agent.skills:
                agent.skills = agent.metadata_["skills"]
                updated = True
            
            # Migrate memory
            if "memory" in agent.metadata_ and not agent.memory_files:
                agent.memory_files = agent.metadata_["memory"]
                updated = True
            
            if updated:
                migrated_count += 1
        
        session.commit()
        print(f"Migrated {migrated_count} agents")

if __name__ == "__main__":
    migrate_skills_and_memory()
```

### 执行数据迁移

```bash
uv run python scripts/migrate_skills_memory.py
```

---

## API 变更

### 创建 Agent

**之前** (使用 metadata):
```json
{
  "name": "My Agent",
  "model": "gpt-4o-mini",
  "metadata": {
    "skills": ["./skills/research/"],
    "memory": ["./AGENTS.md"]
  }
}
```

**现在** (使用专用字段):
```json
{
  "name": "My Agent",
  "model": "gpt-4o-mini",
  "skills": ["./skills/research/"],
  "memory_files": ["./AGENTS.md"]
}
```

### 更新 Agent

**PATCH /api/v1/agents/{agent_id}**

```json
{
  "skills": ["./skills/research/", "./skills/coding/"],
  "memory_files": ["./AGENTS.md", "~/.deepagents/AGENTS.md"]
}
```

### 响应格式

**GET /api/v1/agents/{agent_id}**

```json
{
  "id": "...",
  "name": "My Agent",
  "model": "gpt-4o-mini",
  "model_provider": "openai",
  "tools": ["calculator"],
  "skills": ["./skills/research/"],
  "memory_files": ["./AGENTS.md"],
  "subagents": [],
  "created_at": "...",
  "updated_at": "..."
}
```

---

## 验证测试

### 1. 单元测试

```bash
# 测试数据库字段
PYTHONPATH=. uv run pytest tests/agent/test_agent_fields.py -v

# 测试迁移功能
PYTHONPATH=. uv run pytest tests/agent/test_deepagents_migration.py -v
```

### 2. 集成测试

创建一个带 skills 和 memory_files 的 Agent：

```bash
curl -X POST "http://localhost:8000/api/v1/agents" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "model": "gpt-4o-mini",
    "model_provider": "openai",
    "system_prompt": "You are a test agent.",
    "tools": ["calculator"],
    "skills": ["./skills/research/"],
    "memory_files": ["./AGENTS.md"]
  }'
```

验证响应包含 skills 和 memory_files 字段。

---

## 故障排除

### 问题 1: 迁移失败

**错误**: `relation "agent" does not exist`

**解决**: 确保之前的迁移都已执行：
```bash
uv run alembic upgrade head
```

### 问题 2: 字段已存在

**错误**: `column "skills" of relation "agent" already exists`

**解决**: 该迁移已经执行过，检查当前版本：
```bash
uv run alembic current
```

### 问题 3: 数据类型错误

**错误**: `column "skills" is of type jsonb but expression is of type text`

**解决**: 确保传递的是数组类型，不是字符串：
```python
# 正确
agent.skills = ["./skills/research/"]

# 错误
agent.skills = "./skills/research/"
```

---

## 最佳实践

### 1. Skills 路径格式

推荐使用相对路径：
```python
skills = [
    "./skills/research/",
    "./skills/coding/",
    "./skills/web-scraping/"
]
```

### 2. Memory 文件路径

支持绝对路径和相对路径：
```python
memory_files = [
    "./AGENTS.md",              # 项目级别
    "~/.deepagents/AGENTS.md"   # 用户级别
]
```

### 3. 空值处理

- 如果不需要 skills，设置为 `None` 或 `[]`
- 如果不需要 memory_files，设置为 `None` 或 `[]`
- 不要使用空字符串

### 4. 验证路径

在保存前验证路径是否存在：
```python
import os

def validate_skills(skills: list[str]) -> bool:
    """Validate that skill directories exist."""
    for skill_path in skills:
        if not os.path.isdir(skill_path):
            return False
    return True
```

---

## 总结

✅ **迁移完成后**:
- Agent 表有 `skills` 和 `memory_files` 字段
- API 支持创建和更新这些字段
- `AgentFactory.build_agent_config()` 从数据库字段读取
- 不再依赖 `metadata_` 存储这些配置

**下一步**:
1. 执行数据库迁移
2. 运行测试验证
3. 更新前端代码（如果需要）
4. 部署到生产环境
