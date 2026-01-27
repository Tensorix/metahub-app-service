# Skills 和 Memory 文件系统存储设计文档

## 1. 概述

### 1.1 目标

将 Agent 的 Skills 和 Memory 内容从数据库 JSONB 列迁移到 DeepAgents 的文件系统抽象层，使用 `StoreBackend` + `AsyncPostgresStore` 实现持久化存储。

### 1.2 背景

当前实现：
- `Agent.skills` 和 `Agent.memory_files` 存储在 JSONB 列中
- DeepAgentService 中的 skills/memory 功能标记为 TODO
- DeepAgents 框架期望通过 Backend 抽象层访问文件

DeepAgents 设计：
- `skills` 和 `memory` 参数接收**路径列表**
- `Backend` 负责根据路径读取实际内容
- `StoreBackend` 使用 `namespace=("filesystem",)` 存储文件

### 1.3 参考文档

- [DeepAgents Customization](https://docs.langchain.com/oss/python/deepagents/customization)
- [DeepAgents Backends](https://docs.langchain.com/oss/python/deepagents/backends)

---

## 2. 设计方案

### 2.1 核心思路

```
┌─────────────────────────────────────────────────────────────────┐
│  API 层：接收 skills/memory 内容                                │
│  {skills: [{name, content}], memory_files: [{name, content}]}  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Service 层：写入 AsyncPostgresStore                            │
│  store.aput(namespace=("filesystem",),                          │
│             key="/agents/{agent_id}/skills/xxx/SKILL.md",       │
│             value=create_file_data(content))                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Database：Agent 表存储路径列表                                  │
│  skills = ["/agents/{id}/skills/"]                              │
│  memory_files = ["/agents/{id}/memory/AGENTS.md"]               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Runtime：DeepAgents 通过 StoreBackend 读取                      │
│  create_deep_agent(                                             │
│      backend=(lambda rt: StoreBackend(rt)),                     │
│      store=async_postgres_store,                                │
│      skills=["/agents/{id}/skills/"],                           │
│      memory=["/agents/{id}/memory/AGENTS.md"]                   │
│  )                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 存储结构

#### PostgreSQL Store 表结构

DeepAgents 的 `AsyncPostgresStore` 使用固定的表结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| namespace | TEXT[] | 命名空间，固定为 `["filesystem"]` |
| key | TEXT | 文件路径，如 `/agents/{id}/skills/research/SKILL.md` |
| value | JSONB | 文件内容和元数据 |

#### 文件路径约定

```
/agents/{agent_id}/
├── skills/
│   ├── {skill_name}/
│   │   └── SKILL.md
│   └── {skill_name}/
│       └── SKILL.md
└── memory/
    └── {memory_name}.md
```

示例：
```
/agents/550e8400-e29b-41d4-a716-446655440000/
├── skills/
│   ├── research/
│   │   └── SKILL.md
│   └── content-writing/
│       └── SKILL.md
└── memory/
    └── AGENTS.md
```

### 2.3 Agent 隔离

通过路径前缀 `/agents/{agent_id}/` 实现 Agent 级别隔离：
- 每个 Agent 只能访问自己的 skills 和 memory
- StoreBackend 按路径 key 查询，天然隔离

---

## 3. API 设计

### 3.1 Schema 定义（保持不变）

```python
# app/schema/agent.py

class SkillContent(BaseModel):
    """Skill 内容"""
    name: str = Field(..., description="技能名称，用于生成路径")
    content: str = Field(..., description="技能内容（Markdown，包含 YAML frontmatter）")

class MemoryContent(BaseModel):
    """Memory 内容"""
    name: str = Field(..., description="记忆文件名称")
    content: str = Field(..., description="记忆内容（Markdown）")

class AgentCreate(BaseModel):
    name: str
    system_prompt: Optional[str] = None
    skills: Optional[list[SkillContent]] = None
    memory_files: Optional[list[MemoryContent]] = None
    # ... 其他字段
```

### 3.2 请求示例

```json
{
  "name": "Content Writer",
  "system_prompt": "You are a professional content writer.",
  "skills": [
    {
      "name": "blog-post",
      "content": "---\nname: blog-post\ndescription: Write blog posts with SEO optimization\n---\n\n# Blog Post Writing Skill\n\n## Instructions\n1. Research the topic\n2. Create outline\n3. Write engaging content\n4. Optimize for SEO"
    },
    {
      "name": "social-media",
      "content": "---\nname: social-media\ndescription: Create social media content\n---\n\n# Social Media Skill\n\n## Platforms\n- Twitter: 280 chars\n- LinkedIn: Professional tone"
    }
  ],
  "memory_files": [
    {
      "name": "AGENTS",
      "content": "# Brand Guidelines\n\n## Voice\n- Professional but friendly\n- Use active voice\n\n## Style\n- Short paragraphs\n- Bullet points for lists"
    }
  ]
}
```

### 3.3 响应示例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Content Writer",
  "system_prompt": "You are a professional content writer.",
  "skills": [
    {"name": "blog-post", "content": "---\nname: blog-post\n..."},
    {"name": "social-media", "content": "---\nname: social-media\n..."}
  ],
  "memory_files": [
    {"name": "AGENTS", "content": "# Brand Guidelines\n..."}
  ]
}
```

---

## 4. 实现细节

### 4.1 新增工具函数

```python
# app/agent/utils/file_utils.py

from deepagents.backends.utils import create_file_data
from langgraph.store.postgres import AsyncPostgresStore
from uuid import UUID


async def save_agent_skills(
    store: AsyncPostgresStore,
    agent_id: UUID,
    skills: list[dict],  # [{name, content}, ...]
) -> list[str]:
    """
    将 skills 内容保存到 Store，返回路径列表。

    Args:
        store: AsyncPostgresStore 实例
        agent_id: Agent ID
        skills: skills 内容列表

    Returns:
        skills 目录路径列表，如 ["/agents/{id}/skills/"]
    """
    if not skills:
        return []

    for skill in skills:
        path = f"/agents/{agent_id}/skills/{skill['name']}/SKILL.md"
        await store.aput(
            namespace=("filesystem",),
            key=path,
            value=create_file_data(skill['content'])
        )

    # 返回 skills 目录路径（DeepAgents 会扫描目录下所有 SKILL.md）
    return [f"/agents/{agent_id}/skills/"]


async def save_agent_memory(
    store: AsyncPostgresStore,
    agent_id: UUID,
    memory_files: list[dict],  # [{name, content}, ...]
) -> list[str]:
    """
    将 memory 内容保存到 Store，返回路径列表。

    Args:
        store: AsyncPostgresStore 实例
        agent_id: Agent ID
        memory_files: memory 内容列表

    Returns:
        memory 文件路径列表，如 ["/agents/{id}/memory/AGENTS.md"]
    """
    if not memory_files:
        return []

    paths = []
    for mem in memory_files:
        path = f"/agents/{agent_id}/memory/{mem['name']}.md"
        await store.aput(
            namespace=("filesystem",),
            key=path,
            value=create_file_data(mem['content'])
        )
        paths.append(path)

    return paths


async def load_agent_skills(
    store: AsyncPostgresStore,
    agent_id: UUID,
) -> list[dict]:
    """
    从 Store 加载 Agent 的所有 skills。

    Returns:
        skills 内容列表 [{name, content}, ...]
    """
    skills = []
    prefix = f"/agents/{agent_id}/skills/"

    # 搜索该 agent 的所有 skills
    async for item in store.asearch(namespace=("filesystem",)):
        if item.key.startswith(prefix) and item.key.endswith("/SKILL.md"):
            # 从路径提取 skill name
            # /agents/{id}/skills/{name}/SKILL.md -> {name}
            parts = item.key[len(prefix):].split("/")
            if len(parts) >= 2:
                skill_name = parts[0]
                content = item.value.get("content", "") if isinstance(item.value, dict) else str(item.value)
                skills.append({"name": skill_name, "content": content})

    return skills


async def load_agent_memory(
    store: AsyncPostgresStore,
    agent_id: UUID,
) -> list[dict]:
    """
    从 Store 加载 Agent 的所有 memory files。

    Returns:
        memory 内容列表 [{name, content}, ...]
    """
    memory_files = []
    prefix = f"/agents/{agent_id}/memory/"

    async for item in store.asearch(namespace=("filesystem",)):
        if item.key.startswith(prefix) and item.key.endswith(".md"):
            # 从路径提取 memory name
            # /agents/{id}/memory/{name}.md -> {name}
            filename = item.key[len(prefix):]
            name = filename[:-3]  # 去掉 .md
            content = item.value.get("content", "") if isinstance(item.value, dict) else str(item.value)
            memory_files.append({"name": name, "content": content})

    return memory_files


async def delete_agent_files(
    store: AsyncPostgresStore,
    agent_id: UUID,
) -> None:
    """
    删除 Agent 的所有 skills 和 memory 文件。
    """
    prefix = f"/agents/{agent_id}/"

    # 查找并删除所有相关文件
    keys_to_delete = []
    async for item in store.asearch(namespace=("filesystem",)):
        if item.key.startswith(prefix):
            keys_to_delete.append(item.key)

    for key in keys_to_delete:
        await store.adelete(namespace=("filesystem",), key=key)
```

### 4.2 修改 AgentService

```python
# app/service/agent.py

from app.agent.utils.file_utils import (
    save_agent_skills,
    save_agent_memory,
    load_agent_skills,
    load_agent_memory,
    delete_agent_files,
)


class AgentService:
    """Agent service for CRUD operations."""

    @staticmethod
    async def create_agent(
        db: Session,
        agent_data: AgentCreate,
        store: AsyncPostgresStore,
    ) -> Agent:
        """Create a new agent with skills and memory stored in Store."""
        # 提取子代理数据
        subagents_data = agent_data.subagents or []
        summarization_data = agent_data.summarization
        skills_data = agent_data.skills or []
        memory_data = agent_data.memory_files or []

        # 创建 Agent（不含 skills/memory 内容）
        agent_dict = agent_data.model_dump(
            exclude_unset=True,
            exclude={'subagents', 'summarization', 'skills', 'memory_files'}
        )

        if summarization_data:
            agent_dict['summarization_config'] = summarization_data.model_dump()

        agent = Agent(**agent_dict)
        db.add(agent)
        db.flush()  # 获取 agent.id

        # 保存 skills 到 Store，获取路径列表
        if skills_data:
            skills_list = [{"name": s.name, "content": s.content} for s in skills_data]
            skill_paths = await save_agent_skills(store, agent.id, skills_list)
            agent.skills = skill_paths  # ["/agents/{id}/skills/"]

        # 保存 memory 到 Store，获取路径列表
        if memory_data:
            memory_list = [{"name": m.name, "content": m.content} for m in memory_data]
            memory_paths = await save_agent_memory(store, agent.id, memory_list)
            agent.memory_files = memory_paths  # ["/agents/{id}/memory/xxx.md"]

        # 创建子代理
        for sa_data in subagents_data:
            subagent = SubAgent(
                parent_agent_id=agent.id,
                name=sa_data.name,
                description=sa_data.description,
                system_prompt=sa_data.system_prompt,
                model=sa_data.model,
                tools=sa_data.tools or []
            )
            db.add(subagent)

        db.commit()
        db.refresh(agent)
        return agent

    @staticmethod
    async def get_agent_with_files(
        db: Session,
        agent_id: UUID,
        store: AsyncPostgresStore,
    ) -> tuple[Optional[Agent], list[dict], list[dict]]:
        """
        获取 Agent 及其 skills/memory 内容。

        Returns:
            (agent, skills_content, memory_content)
        """
        agent = db.query(Agent).filter(
            Agent.id == agent_id,
            Agent.is_deleted == False
        ).first()

        if not agent:
            return None, [], []

        # 从 Store 加载内容
        skills_content = await load_agent_skills(store, agent_id)
        memory_content = await load_agent_memory(store, agent_id)

        return agent, skills_content, memory_content

    @staticmethod
    async def update_agent(
        db: Session,
        agent_id: UUID,
        agent_data: AgentUpdate,
        store: AsyncPostgresStore,
    ) -> Optional[Agent]:
        """Update agent with skills and memory."""
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return None

        update_data = agent_data.model_dump(
            exclude_unset=True,
            exclude={'subagents', 'summarization', 'skills', 'memory_files'}
        )

        # 更新基本字段
        for field, value in update_data.items():
            setattr(agent, field, value)

        # 更新 summarization config
        if agent_data.summarization is not None:
            agent.summarization_config = agent_data.summarization.model_dump()

        # 更新 skills（先删除旧的，再保存新的）
        if agent_data.skills is not None:
            # 删除旧 skills
            old_prefix = f"/agents/{agent_id}/skills/"
            async for item in store.asearch(namespace=("filesystem",)):
                if item.key.startswith(old_prefix):
                    await store.adelete(namespace=("filesystem",), key=item.key)

            # 保存新 skills
            if agent_data.skills:
                skills_list = [{"name": s.name, "content": s.content} for s in agent_data.skills]
                skill_paths = await save_agent_skills(store, agent_id, skills_list)
                agent.skills = skill_paths
            else:
                agent.skills = None

        # 更新 memory（同样逻辑）
        if agent_data.memory_files is not None:
            old_prefix = f"/agents/{agent_id}/memory/"
            async for item in store.asearch(namespace=("filesystem",)):
                if item.key.startswith(old_prefix):
                    await store.adelete(namespace=("filesystem",), key=item.key)

            if agent_data.memory_files:
                memory_list = [{"name": m.name, "content": m.content} for m in agent_data.memory_files]
                memory_paths = await save_agent_memory(store, agent_id, memory_list)
                agent.memory_files = memory_paths
            else:
                agent.memory_files = None

        # 更新 subagents
        if agent_data.subagents is not None:
            db.query(SubAgent).filter(SubAgent.parent_agent_id == agent_id).delete()
            for sa_data in agent_data.subagents:
                subagent = SubAgent(
                    parent_agent_id=agent.id,
                    name=sa_data.name,
                    description=sa_data.description,
                    system_prompt=sa_data.system_prompt,
                    model=sa_data.model,
                    tools=sa_data.tools or []
                )
                db.add(subagent)

        db.commit()
        db.refresh(agent)
        return agent

    @staticmethod
    async def delete_agent(
        db: Session,
        agent_id: UUID,
        store: AsyncPostgresStore,
    ) -> bool:
        """Soft delete agent and cleanup Store files."""
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return False

        # 删除 Store 中的文件
        await delete_agent_files(store, agent_id)

        # 软删除 Agent
        agent.is_deleted = True
        db.commit()
        return True
```

### 4.3 修改 DeepAgentService

```python
# app/agent/deep_agent_service.py

from deepagents.backends import StoreBackend

class DeepAgentService:
    """Deep Agent service for AI conversations with streaming support."""

    def _build_backend(self):
        """
        Build StoreBackend for reading skills and memory from AsyncPostgresStore.

        文件存储在 namespace=("filesystem",) 下，路径格式：
        - /agents/{agent_id}/skills/{name}/SKILL.md
        - /agents/{agent_id}/memory/{name}.md
        """
        if not self.store:
            return None

        # 直接使用 StoreBackend，它会从 store 的 ("filesystem",) namespace 读取文件
        return lambda rt: StoreBackend(rt)

    def _get_agent(self):
        """
        Create deep agent with skills and memory from Store.
        """
        if self._agent is None:
            # Build middleware list
            middleware = []

            subagent_mw = self._build_subagent_middleware()
            if subagent_mw:
                middleware.append(subagent_mw)

            summarization_mw = self._build_summarization_middleware()
            if summarization_mw:
                middleware.append(summarization_mw)

            # Build model
            from langchain.chat_models import init_chat_model
            model_string = self._get_model_string()
            model_kwargs = self._get_model_kwargs()
            model = init_chat_model(model_string, **model_kwargs)

            # Agent kwargs
            agent_kwargs = {
                "model": model,
                "tools": self._get_tools(),
                "system_prompt": self.config.get("system_prompt") or (
                    "You are a helpful AI assistant."
                ),
                "middleware": middleware,
                "checkpointer": self.checkpointer,
                "store": self.store,
                "backend": self._build_backend(),
                "name": self.config.get("name"),
            }

            # Skills（路径列表，如 ["/agents/{id}/skills/"]）
            skills = self.config.get("skills")
            if skills:
                agent_kwargs["skills"] = skills

            # Memory（路径列表，如 ["/agents/{id}/memory/AGENTS.md"]）
            memory = self.config.get("memory")
            if memory:
                agent_kwargs["memory"] = memory

            logger.info(
                f"Creating deep agent: model={model_string}, "
                f"tools={len(agent_kwargs['tools'])} custom, "
                f"middleware={len(middleware)}, "
                f"skills={skills}, memory={memory}"
            )

            self._agent = create_deep_agent(**agent_kwargs)

        return self._agent
```

### 4.4 修改 AgentFactory

```python
# app/agent/factory.py

@classmethod
def build_agent_config(cls, agent: "Agent") -> dict[str, Any]:
    """
    Build agent config dict from ORM model.
    """
    agent_config = {
        "agent_id": str(agent.id),
        "name": agent.name,
        "model": agent.model,
        "model_provider": agent.model_provider,
        "system_prompt": agent.system_prompt,
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
        "tools": agent.tools or [],
    }

    # Add subagents
    if agent.subagents:
        agent_config["subagents"] = [
            {
                "name": sa.name,
                "description": sa.description,
                "system_prompt": sa.system_prompt,
                "model": sa.model,
                "tools": sa.tools or [],
            }
            for sa in agent.subagents
            if not sa.is_deleted
        ]

    # Skills 路径列表（从数据库读取）
    if agent.skills:
        agent_config["skills"] = agent.skills

    # Memory 路径列表（从数据库读取）
    if agent.memory_files:
        agent_config["memory"] = agent.memory_files

    # Summarization config
    if agent.summarization_config:
        agent_config["summarization"] = agent.summarization_config

    return agent_config
```

### 4.5 修改 Router

```python
# app/router/v1/agent.py

from app.agent.factory import AgentFactory


@router.post("/agents", response_model=AgentResponse)
async def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
):
    """Create a new agent."""
    store = await AgentFactory.get_store()
    agent = await AgentService.create_agent(db, agent_data, store)

    # 构建响应（包含 skills/memory 内容）
    skills_content = [{"name": s.name, "content": s.content} for s in (agent_data.skills or [])]
    memory_content = [{"name": m.name, "content": m.content} for m in (agent_data.memory_files or [])]

    return AgentResponse(
        **agent.__dict__,
        skills=skills_content,
        memory_files=memory_content,
    )


@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
):
    """Get agent by ID with skills and memory content."""
    store = await AgentFactory.get_store()
    agent, skills_content, memory_content = await AgentService.get_agent_with_files(
        db, agent_id, store
    )

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return AgentResponse(
        **agent.__dict__,
        skills=skills_content,
        memory_files=memory_content,
    )


@router.put("/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
):
    """Update agent."""
    store = await AgentFactory.get_store()
    agent = await AgentService.update_agent(db, agent_id, agent_data, store)

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # 重新加载内容
    _, skills_content, memory_content = await AgentService.get_agent_with_files(
        db, agent_id, store
    )

    return AgentResponse(
        **agent.__dict__,
        skills=skills_content,
        memory_files=memory_content,
    )


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
):
    """Delete agent."""
    store = await AgentFactory.get_store()
    success = await AgentService.delete_agent(db, agent_id, store)

    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {"message": "Agent deleted successfully"}
```

---

## 5. 数据库变更

### 5.1 Agent 表字段说明（无需修改表结构）

| 字段 | 类型 | 变更前 | 变更后 |
|------|------|--------|--------|
| skills | JSONB | 存储内容列表 `[{name, content}]` | 存储路径列表 `["/agents/{id}/skills/"]` |
| memory_files | JSONB | 存储内容列表 `[{name, content}]` | 存储路径列表 `["/agents/{id}/memory/xxx.md"]` |

### 5.2 Store 表（由 AsyncPostgresStore 自动创建）

DeepAgents 使用 LangGraph 的 Store 表存储实际内容：

```sql
-- LangGraph Store 表（自动创建）
CREATE TABLE IF NOT EXISTS store (
    namespace TEXT[] NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (namespace, key)
);
```

---

## 6. Skills 和 Memory 格式

### 6.1 SKILL.md 格式

```markdown
---
name: blog-post
description: Write SEO-optimized blog posts with engaging content
---

# Blog Post Writing Skill

## Overview
This skill helps create professional blog posts optimized for search engines.

## Instructions

1. **Research Phase**
   - Gather information on the topic
   - Identify target keywords
   - Analyze competitor content

2. **Outline Creation**
   - Create a compelling headline
   - Structure with H2/H3 headings
   - Plan introduction and conclusion

3. **Writing**
   - Write engaging introduction with hook
   - Develop each section with examples
   - Include relevant statistics and quotes

4. **SEO Optimization**
   - Include target keywords naturally
   - Write meta description
   - Add internal/external links

## Output Format
- Markdown format
- 1000-2000 words
- Include code blocks if technical
```

### 6.2 Memory (AGENTS.md) 格式

```markdown
# Agent Configuration

## Brand Voice
- Professional but approachable
- Use active voice
- Avoid jargon unless necessary

## Writing Style
- Short paragraphs (2-3 sentences)
- Use bullet points for lists
- Include examples when explaining concepts

## Preferences
- Prefer TypeScript over JavaScript
- Use functional programming patterns
- Follow SOLID principles

## Context
- Primary audience: Software developers
- Industry: Technology
- Tone: Educational
```

---

## 7. 测试用例

### 7.1 单元测试

```python
# tests/test_agent_files.py

import pytest
from uuid import uuid4
from langgraph.store.memory import InMemoryStore
from app.agent.utils.file_utils import (
    save_agent_skills,
    save_agent_memory,
    load_agent_skills,
    load_agent_memory,
)


@pytest.mark.asyncio
async def test_save_and_load_skills():
    store = InMemoryStore()
    agent_id = uuid4()

    skills = [
        {"name": "research", "content": "---\nname: research\n---\n# Research Skill"},
        {"name": "writing", "content": "---\nname: writing\n---\n# Writing Skill"},
    ]

    # 保存
    paths = await save_agent_skills(store, agent_id, skills)
    assert paths == [f"/agents/{agent_id}/skills/"]

    # 加载
    loaded = await load_agent_skills(store, agent_id)
    assert len(loaded) == 2
    assert any(s["name"] == "research" for s in loaded)
    assert any(s["name"] == "writing" for s in loaded)


@pytest.mark.asyncio
async def test_save_and_load_memory():
    store = InMemoryStore()
    agent_id = uuid4()

    memory_files = [
        {"name": "AGENTS", "content": "# Brand Guidelines\n..."},
    ]

    # 保存
    paths = await save_agent_memory(store, agent_id, memory_files)
    assert paths == [f"/agents/{agent_id}/memory/AGENTS.md"]

    # 加载
    loaded = await load_agent_memory(store, agent_id)
    assert len(loaded) == 1
    assert loaded[0]["name"] == "AGENTS"


@pytest.mark.asyncio
async def test_agent_isolation():
    store = InMemoryStore()
    agent_1 = uuid4()
    agent_2 = uuid4()

    # Agent 1 的 skills
    await save_agent_skills(store, agent_1, [{"name": "skill1", "content": "Agent 1 skill"}])

    # Agent 2 的 skills
    await save_agent_skills(store, agent_2, [{"name": "skill2", "content": "Agent 2 skill"}])

    # 验证隔离
    agent_1_skills = await load_agent_skills(store, agent_1)
    agent_2_skills = await load_agent_skills(store, agent_2)

    assert len(agent_1_skills) == 1
    assert agent_1_skills[0]["name"] == "skill1"

    assert len(agent_2_skills) == 1
    assert agent_2_skills[0]["name"] == "skill2"
```

### 7.2 集成测试

```python
# tests/test_agent_api.py

@pytest.mark.asyncio
async def test_create_agent_with_skills_and_memory(client, db):
    response = await client.post("/api/v1/agents", json={
        "name": "Test Agent",
        "skills": [
            {"name": "test-skill", "content": "---\nname: test-skill\n---\n# Test"}
        ],
        "memory_files": [
            {"name": "AGENTS", "content": "# Test Memory"}
        ]
    })

    assert response.status_code == 200
    data = response.json()

    assert data["name"] == "Test Agent"
    assert len(data["skills"]) == 1
    assert data["skills"][0]["name"] == "test-skill"
    assert len(data["memory_files"]) == 1


@pytest.mark.asyncio
async def test_agent_chat_uses_skills(client, db):
    # 创建带 skill 的 agent
    create_resp = await client.post("/api/v1/agents", json={
        "name": "Skilled Agent",
        "skills": [
            {
                "name": "greeting",
                "content": "---\nname: greeting\ndescription: Greet users warmly\n---\n# Always say 'Hello friend!'"
            }
        ]
    })
    agent_id = create_resp.json()["id"]

    # 发送消息
    chat_resp = await client.post(f"/api/v1/chat/{agent_id}", json={
        "message": "Hi there!"
    })

    # 验证 agent 使用了 skill
    assert chat_resp.status_code == 200
```

---

## 8. 迁移计划

### 8.1 数据迁移脚本

```python
# scripts/migrate_skills_memory.py

"""
迁移脚本：将现有 Agent 的 skills/memory 内容从 JSONB 迁移到 Store。
"""

import asyncio
from sqlalchemy import select
from app.db.session import async_session
from app.db.model.agent import Agent
from app.agent.factory import AgentFactory
from app.agent.utils.file_utils import save_agent_skills, save_agent_memory


async def migrate():
    store = await AgentFactory.get_store()

    async with async_session() as db:
        # 查询所有 Agent
        result = await db.execute(
            select(Agent).where(Agent.is_deleted == False)
        )
        agents = result.scalars().all()

        for agent in agents:
            print(f"Migrating agent: {agent.id} ({agent.name})")

            # 迁移 skills
            if agent.skills and isinstance(agent.skills, list):
                # 检查是否是旧格式（内容列表）
                if agent.skills and isinstance(agent.skills[0], dict) and 'content' in agent.skills[0]:
                    skill_paths = await save_agent_skills(store, agent.id, agent.skills)
                    agent.skills = skill_paths
                    print(f"  - Migrated {len(skill_paths)} skills")

            # 迁移 memory
            if agent.memory_files and isinstance(agent.memory_files, list):
                if agent.memory_files and isinstance(agent.memory_files[0], dict) and 'content' in agent.memory_files[0]:
                    memory_paths = await save_agent_memory(store, agent.id, agent.memory_files)
                    agent.memory_files = memory_paths
                    print(f"  - Migrated {len(memory_paths)} memory files")

            await db.commit()

    print("Migration completed!")


if __name__ == "__main__":
    asyncio.run(migrate())
```

### 8.2 执行步骤

1. **备份数据库**
   ```bash
   pg_dump -h localhost -U postgres metahub > backup.sql
   ```

2. **部署新代码**
   ```bash
   git pull origin main
   pip install -r requirements.txt
   ```

3. **运行迁移脚本**
   ```bash
   python scripts/migrate_skills_memory.py
   ```

4. **验证迁移结果**
   ```bash
   python -c "
   import asyncio
   from app.agent.factory import AgentFactory

   async def check():
       store = await AgentFactory.get_store()
       async for item in store.asearch(namespace=('filesystem',)):
           print(f'{item.key}: {len(str(item.value))} bytes')

   asyncio.run(check())
   "
   ```

---

## 9. 文件结构

```
app/
├── agent/
│   ├── __init__.py
│   ├── deep_agent_service.py    # 修改：使用 StoreBackend
│   ├── factory.py               # 修改：build_agent_config
│   ├── utils/
│   │   ├── __init__.py
│   │   └── file_utils.py        # 新增：skills/memory 存储工具
│   └── tools/
│       └── ...
├── service/
│   └── agent.py                 # 修改：使用 store 存储内容
├── router/
│   └── v1/
│       └── agent.py             # 修改：传递 store 参数
└── schema/
    └── agent.py                 # 无需修改
```

---

## 10. 总结

### 10.1 关键变更

| 组件 | 变更内容 |
|------|----------|
| AgentService | 使用 `AsyncPostgresStore` 存储 skills/memory 内容 |
| DeepAgentService | 使用 `StoreBackend` 读取文件 |
| Agent 表 | `skills`/`memory_files` 字段存储路径而非内容 |
| API | 响应时从 Store 加载内容返回给前端 |

### 10.2 优势

1. **符合 DeepAgents 设计**：使用官方推荐的 `StoreBackend` 方式
2. **复用现有基础设施**：使用已有的 `AsyncPostgresStore`
3. **Agent 隔离**：通过路径前缀实现天然隔离
4. **简单实现**：无需自定义 Backend

### 10.3 注意事项

1. Skills 内容必须包含 YAML frontmatter（name + description）
2. Memory 文件会被 Agent 主动读取，不会自动合并到 system_prompt
3. 删除 Agent 时需要同时清理 Store 中的文件
