# MCP Server 加载问题修复

## 问题描述

用户添加 MCP Server 后，重新打开 Agent 编辑对话框时显示"暂无 MCP Server"。

## 根本原因分析

通过测试脚本 `test_mcp_server_loading.py` 验证，发现：

1. ✅ **后端数据库**: MCP servers 正确保存（测试显示有 3 个）
2. ✅ **后端查询**: `AgentService.get_agent()` 正确加载 mcp_servers 关系
3. ✅ **API 响应**: 后端 API 正确返回 mcp_servers 数据
4. ❌ **前端加载**: 前端在编辑时使用列表数据，没有重新获取完整的 agent 详情

## 问题定位

### 前端流程

1. 用户点击"编辑" → `openEditDialog(agent)` 
2. 直接使用列表中的 `agent` 对象
3. 列表 API (`listAgents`) 返回的数据可能不完整
4. `AgentDialog` 组件从 `agent.mcp_servers` 读取数据
5. 如果列表数据中没有 `mcp_servers`，就显示"暂无"

### 后端流程

虽然后端 `list_agents` 已经添加了 `joinedload(Agent.mcp_servers)`，但由于 SQLAlchemy 的序列化机制，列表 API 可能不会完整序列化所有关系数据。

## 解决方案

### 1. 后端优化 ✅

**文件**: `app/service/agent.py`

添加 `joinedload` 确保预加载 mcp_servers 关系：

```python
from sqlalchemy.orm import Session, joinedload

@staticmethod
def get_agent(db: Session, agent_id: UUID) -> Optional[Agent]:
    """Get agent by ID."""
    return db.query(Agent).options(
        joinedload(Agent.mcp_servers)  # ← 添加这行
    ).filter(
        Agent.id == agent_id,
        Agent.is_deleted == False
    ).first()

@staticmethod
def list_agents(db: Session, page: int = 1, page_size: int = 20, search: Optional[str] = None) -> tuple[list[Agent], int]:
    """List agents with pagination."""
    query = db.query(Agent).options(
        joinedload(Agent.mcp_servers)  # ← 添加这行
    ).filter(Agent.is_deleted == False)
    # ...
```

### 2. 前端修复 ✅

**文件**: `frontend/src/pages/Agents.tsx`

在编辑时重新获取完整的 agent 数据：

```typescript
// 修改前 ❌
const openEditDialog = (agent: Agent) => {
  setEditingAgent(agent);  // 直接使用列表数据
  setDialogOpen(true);
};

// 修改后 ✅
const openEditDialog = async (agent: Agent) => {
  try {
    // 重新获取完整的 agent 数据，确保包含 mcp_servers
    const fullAgent = await agentManagementApi.getAgent(agent.id);
    console.log('Full agent data:', fullAgent);
    console.log('MCP Servers:', fullAgent.mcp_servers);
    setEditingAgent(fullAgent);
    setDialogOpen(true);
  } catch (error) {
    console.error('Failed to load agent details:', error);
    toast({
      title: '加载失败',
      description: '无法加载 Agent 详情',
      variant: 'destructive',
    });
  }
};
```

## 修改的文件

1. `app/service/agent.py` - 添加 `joinedload(Agent.mcp_servers)`
2. `frontend/src/pages/Agents.tsx` - 编辑时重新获取完整数据
3. `test_mcp_server_loading.py` - 测试脚本（用于验证）

## 测试验证

### 后端测试

运行测试脚本：
```bash
python test_mcp_server_loading.py
```

结果：
```
✅ 找到 Agent: mytest (ID: 019bfb4c-05ec-72d8-873f-82fe3a966a14)

📊 Agent.mcp_servers 属性:
   类型: <class 'sqlalchemy.orm.collections.InstrumentedList'>
   数量: 3
   - yunxiao (sse): https://yunxiao-mcp.laplacelab.tech/sse
   - yunxiao (sse): https://yunxiao-mcp.laplacelab.tech/sse
   - test (sse): https://yunxiao-mcp.laplacelab.tech/sse

✅ 数量一致
✅ 重新加载成功
```

### 前端测试

1. 打开 Agents 页面
2. 点击编辑某个 Agent
3. 切换到 "MCP Servers" 标签
4. 应该能看到之前添加的 MCP servers

## 为什么需要两处修改？

### 后端修改的必要性

虽然 `Agent` 模型中 `mcp_servers` 关系已经设置了 `lazy="selectin"`，但在某些情况下（特别是分页查询），SQLAlchemy 可能不会自动加载。显式添加 `joinedload` 确保：

1. 减少 N+1 查询问题
2. 确保数据完整性
3. 提高查询性能

### 前端修改的必要性

即使后端正确返回数据，前端也应该：

1. **数据一致性**: 列表 API 和详情 API 可能返回不同级别的数据
2. **最新数据**: 重新获取确保数据是最新的
3. **完整性**: 详情 API 通常返回更完整的数据
4. **最佳实践**: 编辑前获取最新数据是标准做法

## 额外优化建议

### 1. 添加加载状态

```typescript
const [loadingAgent, setLoadingAgent] = useState(false);

const openEditDialog = async (agent: Agent) => {
  setLoadingAgent(true);
  try {
    const fullAgent = await agentManagementApi.getAgent(agent.id);
    setEditingAgent(fullAgent);
    setDialogOpen(true);
  } catch (error) {
    // ...
  } finally {
    setLoadingAgent(false);
  }
};
```

### 2. 缓存优化

可以考虑在前端缓存完整的 agent 数据，避免重复请求：

```typescript
const [agentCache, setAgentCache] = useState<Map<string, Agent>>(new Map());

const openEditDialog = async (agent: Agent) => {
  // 检查缓存
  if (agentCache.has(agent.id)) {
    setEditingAgent(agentCache.get(agent.id)!);
    setDialogOpen(true);
    return;
  }
  
  // 获取并缓存
  const fullAgent = await agentManagementApi.getAgent(agent.id);
  setAgentCache(new Map(agentCache).set(agent.id, fullAgent));
  setEditingAgent(fullAgent);
  setDialogOpen(true);
};
```

### 3. 列表 API 优化

如果列表页面需要显示 MCP server 数量，可以在后端添加计数字段：

```python
class AgentResponse(AgentBase):
    # ...
    mcp_servers: list[McpServerResponse] = Field(default_factory=list)
    mcp_server_count: int = Field(0, description="MCP Server 数量")
```

## 总结

问题的根本原因是前端在编辑时直接使用列表数据，而没有重新获取完整的 agent 详情。通过以下两个修改解决：

1. ✅ **后端**: 添加 `joinedload` 确保关系数据正确加载
2. ✅ **前端**: 编辑时重新获取完整的 agent 数据

现在用户添加 MCP Server 后，重新打开编辑对话框应该能正确显示所有 MCP servers。
