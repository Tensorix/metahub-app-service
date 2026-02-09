# Step 5: AgentFactory 改造

## 概述

改造 `AgentFactory.build_agent_config()`，从新的 `agent_subagent` 关联表读取 SubAgent 配置，并让 SubAgent 获得完整的 Agent 能力（包括 MCP Servers）。

## 5.1 build_agent_config() 改造

### 当前实现

```python
# 当前：从 SubAgent ORM 对象构建
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
```

### 新实现

```python
@classmethod
def build_agent_config(cls, agent: "Agent") -> dict[str, Any]:
    """Build agent config dict from ORM model.
    
    SubAgent 现在是完整的 Agent，拥有所有 Agent 能力。
    """
    agent_config = {
        "_agent_id": agent.id,
        "name": agent.name,
        "description": agent.description,
        "model": agent.model,
        "model_provider": agent.model_provider,
        "system_prompt": agent.system_prompt,
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
        "tools": agent.tools or [],
    }

    # --- SubAgent 配置：从关联表读取完整 Agent 信息 ---
    if agent.mounted_subagents:
        agent_config["subagents"] = [
            cls._build_subagent_config(mount)
            for mount in agent.mounted_subagents
            if not mount.child_agent.is_deleted
        ]

    # --- 其余不变 ---
    if agent.skills:
        agent_config["skills"] = agent.skills

    if agent.memory_files:
        agent_config["memory"] = agent.memory_files

    if agent.summarization_config:
        agent_config["summarization"] = agent.summarization_config

    if agent.mcp_servers:
        agent_config["mcp_servers"] = [
            {
                "name": ms.name,
                "transport": ms.transport,
                "url": ms.url,
                "headers": ms.headers,
                "is_enabled": ms.is_enabled,
            }
            for ms in agent.mcp_servers
            if not ms.is_deleted
        ]

    return agent_config


@classmethod
def _build_subagent_config(cls, mount: "AgentSubagent") -> dict[str, Any]:
    """从关联记录 + 子 Agent 构建 SubAgent 运行时配置。

    关键改进：SubAgent 现在拥有完整的 Agent 能力：
    - model_provider：可以使用不同的 LLM 提供商
    - temperature / max_tokens：独立的推理参数
    - mcp_servers：独立的 MCP 工具集
    - skills / memory_files：独立的知识库
    """
    child = mount.child_agent

    config = {
        "_agent_id": child.id,  # 用于 MCP 工具缓存
        "name": child.name,
        # mount_description 优先，其次 child.description
        "description": mount.mount_description or child.description or "",
        "system_prompt": child.system_prompt or "",
        "model": child.model,
        "model_provider": child.model_provider,
        "temperature": child.temperature,
        "max_tokens": child.max_tokens,
        "tools": child.tools or [],
    }

    # ✅ 新增：SubAgent 的 MCP Servers
    if child.mcp_servers:
        config["mcp_servers"] = [
            {
                "name": ms.name,
                "transport": ms.transport,
                "url": ms.url,
                "headers": ms.headers,
                "is_enabled": ms.is_enabled,
            }
            for ms in child.mcp_servers
            if not ms.is_deleted
        ]

    # ✅ 新增：SubAgent 的 Skills
    if child.skills:
        config["skills"] = child.skills

    # ✅ 新增：SubAgent 的 Memory
    if child.memory_files:
        config["memory"] = child.memory_files

    return config
```

## 5.2 缓存失效改造

当子 Agent 被修改时，需要清除所有引用它的父 Agent 的缓存：

```python
@classmethod
def clear_cache_cascade(cls, agent_id: UUID, db: Session):
    """清除 Agent 缓存，并级联清除所有父 Agent 的缓存。

    当 Agent 被修改时，所有将其作为 SubAgent 的父 Agent
    也需要清除缓存，因为运行时配置已经过期。
    """
    # 清除自身缓存
    cls.clear_cache(agent_id)

    # 查找所有将此 Agent 作为 SubAgent 的父 Agent
    from app.db.model.agent_subagent import AgentSubagent

    parent_mounts = db.query(AgentSubagent.parent_agent_id).filter(
        AgentSubagent.child_agent_id == agent_id,
    ).all()

    for (parent_id,) in parent_mounts:
        cls.clear_cache(parent_id)
```

## 5.3 配置数据流图

```
Agent (ORM)
  │
  ├── mounted_subagents (selectin 加载)
  │     ├── [0] AgentSubagent
  │     │      ├── mount_description: "处理搜索任务"
  │     │      └── child_agent → Agent (id=X, name="搜索专家")
  │     │                          ├── model: "gpt-4o"
  │     │                          ├── model_provider: "openai"
  │     │                          ├── tools: ["web_search"]
  │     │                          └── mcp_servers: [Google Search MCP]
  │     └── [1] AgentSubagent
  │            ├── mount_description: "代码相关任务"
  │            └── child_agent → Agent (id=Y, name="代码专家")
  │                               ├── model: "claude-4-sonnet"
  │                               ├── model_provider: "anthropic"  ← 不同 provider!
  │                               ├── tools: ["read_file", "grep"]
  │                               └── mcp_servers: [GitHub MCP]
  │
  ▼ build_agent_config()
  │
agent_config = {
    "subagents": [
        {
            "_agent_id": X,
            "name": "搜索专家",
            "description": "处理搜索任务",  ← mount_description 优先
            "model": "gpt-4o",
            "model_provider": "openai",
            "tools": ["web_search"],
            "mcp_servers": [{name: "Google Search MCP", ...}],  ← ✅ 新增！
        },
        {
            "_agent_id": Y,
            "name": "代码专家",
            "description": "代码相关任务",
            "model": "claude-4-sonnet",
            "model_provider": "anthropic",
            "tools": ["read_file", "grep"],
            "mcp_servers": [{name: "GitHub MCP", ...}],  ← ✅ 新增！
        },
    ],
}
```
