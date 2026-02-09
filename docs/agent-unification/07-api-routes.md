# Step 7: API 路由层改造

## 概述

新增 SubAgent 挂载管理的 RESTful API 端点，修改现有 Agent CRUD 端点。

## 7.1 新增 SubAgent 挂载 API

在现有 `app/api/agent.py` 中新增挂载端点，挂在 `/agents/{agent_id}/subagents` 路径下。

### 端点清单

| 方法 | 路径 | 功能 | 请求体 | 响应 |
|------|------|------|--------|------|
| `GET` | `/agents/{agent_id}/subagents` | 列出已挂载的 SubAgent | — | `list[MountedSubagentSummary]` |
| `POST` | `/agents/{agent_id}/subagents` | 挂载一个 SubAgent | `MountSubagentRequest` | `MountedSubagentSummary`, `201` |
| `PUT` | `/agents/{agent_id}/subagents/{child_id}` | 更新挂载配置 | `UpdateMountRequest` | `MountedSubagentSummary` |
| `DELETE` | `/agents/{agent_id}/subagents/{child_id}` | 卸载 SubAgent | — | `204` |
| `PUT` | `/agents/{agent_id}/subagents` | 批量替换所有 SubAgent | `BatchMountSubagentRequest` | `list[MountedSubagentSummary]` |
| `GET` | `/agents/{agent_id}/mountable` | 列出可挂载的候选 Agent | Query params | `AgentListResponse` |

### 实现代码

```python
# ============================================================
# SubAgent 挂载管理
# ============================================================

@router.get(
    "/{agent_id}/subagents",
    response_model=list[MountedSubagentSummary],
    summary="列出已挂载的 SubAgent",
)
def list_subagents(
    agent_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    mounts = AgentService.list_mounted_subagents(db, agent_id)
    return [_build_mount_summary(m) for m in mounts]


@router.post(
    "/{agent_id}/subagents",
    response_model=MountedSubagentSummary,
    status_code=201,
    summary="挂载一个 SubAgent",
)
def mount_subagent(
    agent_id: UUID,
    body: MountSubagentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        mount = AgentService.mount_subagent(db, agent_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 清除缓存
    AgentFactory.clear_cache(agent_id)

    return _build_mount_summary(mount)


@router.put(
    "/{agent_id}/subagents/{child_id}",
    response_model=MountedSubagentSummary,
    summary="更新已挂载 SubAgent 的配置",
)
def update_subagent_mount(
    agent_id: UUID,
    child_id: UUID,
    body: UpdateMountRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    mount = AgentService.update_mount(db, agent_id, child_id, body)
    if not mount:
        raise HTTPException(status_code=404, detail="Mount not found")

    AgentFactory.clear_cache(agent_id)

    return _build_mount_summary(mount)


@router.delete(
    "/{agent_id}/subagents/{child_id}",
    status_code=204,
    summary="卸载 SubAgent",
)
def unmount_subagent(
    agent_id: UUID,
    child_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    success = AgentService.unmount_subagent(db, agent_id, child_id)
    if not success:
        raise HTTPException(status_code=404, detail="Mount not found")

    AgentFactory.clear_cache(agent_id)


@router.put(
    "/{agent_id}/subagents",
    response_model=list[MountedSubagentSummary],
    summary="批量替换所有 SubAgent",
)
def replace_subagents(
    agent_id: UUID,
    body: BatchMountSubagentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        mounts = AgentService.replace_mounted_subagents(
            db, agent_id, body.subagents
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    AgentFactory.clear_cache(agent_id)

    return [_build_mount_summary(m) for m in mounts]


@router.get(
    "/{agent_id}/mountable",
    response_model=AgentListResponse,
    summary="列出可挂载的候选 Agent",
)
def list_mountable_agents(
    agent_id: UUID,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agents, total = AgentService.list_mountable_agents(
        db, agent_id, search=search, page=page, page_size=page_size
    )
    return AgentListResponse(
        items=[build_agent_response(a) for a in agents],
        total=total,
        page=page,
        page_size=page_size,
    )


# ============================================================
# Helper
# ============================================================

def _build_mount_summary(mount: AgentSubagent) -> MountedSubagentSummary:
    """从 AgentSubagent ORM 对象构建响应 Summary。"""
    child = mount.child_agent
    return MountedSubagentSummary(
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
    )
```

## 7.2 修改现有 Agent CRUD 端点

### create_agent

```diff
  @router.post("/", response_model=AgentResponse, status_code=201)
  def create_agent(body: AgentCreate, db: Session = Depends(get_db), ...):
-     agent = AgentService.create_agent(db, body)
+     try:
+         agent = AgentService.create_agent(db, body)
+     except ValueError as e:
+         raise HTTPException(status_code=400, detail=str(e))
      return build_agent_response(agent)
```

> 需要捕获 `ValueError`，因为 `create_agent` 中的 `mount_subagents` 可能触发循环引用检测。

### update_agent

```diff
  @router.put("/{agent_id}", response_model=AgentResponse)
  def update_agent(agent_id: UUID, body: AgentUpdate, ...):
      agent = AgentService.update_agent(db, agent_id, body)
      if not agent:
          raise HTTPException(status_code=404)
-     AgentFactory.clear_cache(agent_id)
+     # 级联清除：修改 Agent 后，所有将其作为 SubAgent 的父 Agent 也需清缓存
+     AgentFactory.clear_cache_cascade(agent_id, db)
      return build_agent_response(agent)
```

### delete_agent

```diff
  @router.delete("/{agent_id}", status_code=204)
  def delete_agent(agent_id: UUID, ...):
+     # 删除前：获取所有父 Agent ID 用于清缓存
+     parent_agents = AgentService.list_parent_agents(db, agent_id)
+     parent_ids = [a.id for a in parent_agents]
+
      success = AgentService.delete_agent(db, agent_id)
      if not success:
          raise HTTPException(status_code=404)
-     AgentFactory.clear_cache(agent_id)
+     AgentFactory.clear_cache(agent_id)
+     for pid in parent_ids:
+         AgentFactory.clear_cache(pid)
```

## 7.3 修改 MCP Server API

当 Agent 的 MCP Server 发生变化时，也需要级联清除引用它的父 Agent 缓存：

```diff
  # app/api/mcp_server.py

  @router.post("/{agent_id}/mcp-servers/", ...)
  def create_mcp_server(agent_id: UUID, ...):
      # ...
-     AgentFactory.clear_cache(agent_id)
+     AgentFactory.clear_cache_cascade(agent_id, db)
      return server

  @router.put("/{agent_id}/mcp-servers/{server_id}", ...)
  def update_mcp_server(agent_id: UUID, ...):
      # ...
-     AgentFactory.clear_cache(agent_id)
+     AgentFactory.clear_cache_cascade(agent_id, db)
      return server

  @router.delete("/{agent_id}/mcp-servers/{server_id}", ...)
  def delete_mcp_server(agent_id: UUID, ...):
      # ...
-     AgentFactory.clear_cache(agent_id)
+     AgentFactory.clear_cache_cascade(agent_id, db)
```

## 7.4 API 交互示例

### 场景：创建一个带 SubAgent 的主 Agent

```bash
# Step 1: 创建"搜索专家" Agent
curl -X POST /api/v1/agents/ \
  -d '{
    "name": "搜索专家",
    "description": "擅长网络搜索和信息检索",
    "model": "gpt-4o-mini",
    "tools": ["web_search"]
  }'
# → { "id": "agent-search-id", ... }

# Step 2: 为搜索专家配置 MCP Server
curl -X POST /api/v1/agents/agent-search-id/mcp-servers/ \
  -d '{ "name": "Google Search", "transport": "sse", "url": "..." }'

# Step 3: 创建"代码专家" Agent
curl -X POST /api/v1/agents/ \
  -d '{
    "name": "代码专家",
    "description": "擅长代码审查、编写和调试",
    "model": "claude-4-sonnet",
    "model_provider": "anthropic",
    "tools": ["read_file", "grep", "edit_file"]
  }'
# → { "id": "agent-code-id", ... }

# Step 4: 创建"主协调者" Agent，挂载两个 SubAgent
curl -X POST /api/v1/agents/ \
  -d '{
    "name": "全能助手",
    "model": "gpt-4o",
    "system_prompt": "你是一个全能助手，可以委派搜索和代码任务给子代理。",
    "mount_subagents": [
      { "agent_id": "agent-search-id", "mount_description": "负责所有搜索任务" },
      { "agent_id": "agent-code-id", "mount_description": "负责所有代码相关任务" }
    ]
  }'

# 或者分步挂载：
curl -X POST /api/v1/agents/main-agent-id/subagents \
  -d '{ "agent_id": "agent-search-id", "mount_description": "负责所有搜索任务" }'
```

### 场景：查询可挂载的候选 Agent

```bash
curl -X GET /api/v1/agents/main-agent-id/mountable?search=专家
# → {
#     "items": [
#       { "id": "agent-code-id", "name": "代码专家", ... },
#       { "id": "agent-data-id", "name": "数据分析专家", ... }
#     ],
#     "total": 2
#   }
# 注意：自身、已挂载的、祖先节点均已排除
```
