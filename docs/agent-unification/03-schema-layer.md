# Step 3: Pydantic Schema 层改造

## 概述

重构 API 请求/响应的 Schema 定义，核心变化：
1. 移除内嵌的 `SubAgentSchema`（不再在 AgentCreate 中内联创建 SubAgent）
2. 新增独立的挂载请求/响应 Schema
3. `AgentResponse` 中返回挂载的 SubAgent 摘要信息

## 3.1 移除旧的 SubAgentSchema

**删除以下 Schema**（从 `app/schema/agent.py`）：

```python
# ❌ 废弃
class SubAgentSchema(BaseModel):
    id: Optional[UUID] = None
    name: str
    description: str
    system_prompt: Optional[str]
    model: Optional[str]
    tools: Optional[list[str]]
```

## 3.2 新增 Schema 定义

### 挂载请求 Schema

```python
class MountSubagentRequest(BaseModel):
    """将一个已有 Agent 挂载为当前 Agent 的 SubAgent。"""

    agent_id: UUID = Field(..., description="要挂载的 Agent ID")
    mount_description: Optional[str] = Field(
        None,
        description="在当前 Agent 上下文中的角色描述（覆盖子 Agent 的通用 description）",
    )
    sort_order: int = Field(0, ge=0, description="排序序号")


class UpdateMountRequest(BaseModel):
    """更新已挂载 SubAgent 的配置。"""

    mount_description: Optional[str] = Field(None, description="更新角色描述")
    sort_order: Optional[int] = Field(None, ge=0, description="更新排序序号")


class BatchMountSubagentRequest(BaseModel):
    """批量挂载多个 Agent 为 SubAgent（用于初始配置或全量替换）。"""

    subagents: list[MountSubagentRequest] = Field(
        ..., description="要挂载的 SubAgent 列表"
    )
```

### 挂载响应 Schema

```python
class MountedSubagentSummary(BaseModel):
    """已挂载的 SubAgent 摘要信息。"""

    agent_id: UUID = Field(..., description="子 Agent ID")
    name: str = Field(..., description="子 Agent 名称")
    description: Optional[str] = Field(None, description="子 Agent 通用描述")
    mount_description: Optional[str] = Field(
        None, description="在父 Agent 上下文中的角色描述"
    )
    effective_description: str = Field(
        ..., description="生效的描述 (mount_description ?? description)"
    )
    model: Optional[str] = Field(None, description="子 Agent 使用的模型")
    model_provider: Optional[str] = Field(None, description="模型提供商")
    tools: list[str] = Field(default_factory=list, description="子 Agent 的工具列表")
    has_mcp_servers: bool = Field(False, description="是否配置了 MCP Servers")
    sort_order: int = Field(0, description="排序序号")

    model_config = ConfigDict(from_attributes=True)
```

## 3.3 修改 AgentBase / AgentCreate / AgentUpdate

### AgentBase

```diff
  class AgentBase(BaseModel):
      name: str = Field(...)
+     description: Optional[str] = Field(None, description="通用能力描述")
      system_prompt: Optional[str] = Field(None)
      model: Optional[str] = Field("gpt-4o-mini")
      model_provider: Optional[str] = Field("openai")
      temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
      max_tokens: Optional[int] = Field(4096, gt=0)
      tools: Optional[list[str]] = Field(default_factory=list)
      skills: Optional[list[SkillContent]] = Field(None)
      memory_files: Optional[list[MemoryContent]] = Field(None)
-     subagents: Optional[list[SubAgentSchema]] = Field(default_factory=list)
      summarization: Optional[SummarizationConfig] = Field(None)
      metadata_: Optional[dict] = Field(None, alias="metadata")
```

### AgentCreate

```python
class AgentCreate(AgentBase):
    """创建 Agent 请求。

    创建 Agent 后，通过独立的挂载 API 添加 SubAgent。
    也支持创建时一步到位挂载（通过 mount_subagents 字段）。
    """

    mount_subagents: Optional[list[MountSubagentRequest]] = Field(
        None,
        description="创建时同时挂载的 SubAgent 列表（可选，也可创建后再挂载）",
    )
```

### AgentUpdate

```diff
  class AgentUpdate(BaseModel):
      name: Optional[str] = Field(None)
+     description: Optional[str] = Field(None)
      system_prompt: Optional[str] = Field(None)
      model: Optional[str] = Field(None)
      model_provider: Optional[str] = Field(None)
      temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
      max_tokens: Optional[int] = Field(None, gt=0)
      tools: Optional[list[str]] = Field(None)
      skills: Optional[list[SkillContent]] = Field(None)
      memory_files: Optional[list[MemoryContent]] = Field(None)
-     subagents: Optional[list[SubAgentSchema]] = Field(None)
      summarization: Optional[SummarizationConfig] = Field(None)
      metadata_: Optional[dict] = Field(None, alias="metadata")
```

> **设计决策**：`AgentUpdate` 中不再包含 `subagents` 字段。SubAgent 的挂载/卸载通过独立的 API 管理，不与 Agent 基本信息更新混合。这遵循 **单一职责原则**，避免了当前"更新 Agent 时全量替换 SubAgent"的粗暴行为。

### AgentResponse

```diff
  class AgentResponse(AgentBase):
      id: UUID
+     description: Optional[str] = None
      created_at: datetime
      updated_at: datetime
      is_deleted: bool
-     subagents: list[SubAgentSchema] = Field(default_factory=list)
+     subagents: list[MountedSubagentSummary] = Field(
+         default_factory=list,
+         description="已挂载的 SubAgent 列表"
+     )
      mcp_servers: list[McpServerResponse] = Field(default_factory=list)

      model_config = ConfigDict(from_attributes=True, populate_by_name=True)
```

## 3.4 新增 Agent 列表筛选参数

```python
class AgentListQuery(BaseModel):
    """Agent 列表查询参数。"""

    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    search: Optional[str] = Field(None, description="按名称搜索")
    exclude_id: Optional[UUID] = Field(
        None,
        description="排除指定 Agent ID（用于挂载选择时排除自身及祖先）",
    )
    mountable_for: Optional[UUID] = Field(
        None,
        description="筛选可挂载为指定 Agent SubAgent 的候选列表（排除自身、祖先、已挂载的）",
    )
```

## 3.5 完整 Schema 文件结构

```python
# app/schema/agent.py

# --- 基础组件 ---
class SkillContent(BaseModel): ...
class MemoryContent(BaseModel): ...
class SummarizationConfig(BaseModel): ...

# --- 挂载相关 ---
class MountSubagentRequest(BaseModel): ...
class UpdateMountRequest(BaseModel): ...
class BatchMountSubagentRequest(BaseModel): ...
class MountedSubagentSummary(BaseModel): ...

# --- Agent CRUD ---
class AgentBase(BaseModel): ...
class AgentCreate(AgentBase): ...
class AgentUpdate(BaseModel): ...
class AgentResponse(AgentBase): ...
class AgentListResponse(BaseModel): ...
class AgentListQuery(BaseModel): ...
```

## 3.6 Response 构建逻辑

`AgentResponse` 中 `subagents` 字段的构建需要从 `Agent.mounted_subagents` 关系映射：

```python
# 在 API 层或 Service 层中
def build_agent_response(agent: Agent) -> AgentResponse:
    subagent_summaries = []
    for mount in agent.mounted_subagents:
        child = mount.child_agent
        if child.is_deleted:
            continue
        subagent_summaries.append(MountedSubagentSummary(
            agent_id=child.id,
            name=child.name,
            description=child.description,
            mount_description=mount.mount_description,
            effective_description=mount.mount_description or child.description or "",
            model=child.model,
            model_provider=child.model_provider,
            tools=child.tools or [],
            has_mcp_servers=bool(child.mcp_servers),
            sort_order=mount.sort_order,
        ))
    # ... 构建完整 response
```
