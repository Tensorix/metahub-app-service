# Agent 统一抽象 - 前端适配指南

## 概述

本指南详细说明前端如何适配 Agent 与 SubAgent 统一抽象的新 API。

## API 变化总结

### 1. Agent Schema 变化

#### 新增字段
- `description`: Agent 的通用能力描述

#### 修改字段
- `subagents`: 类型从 `SubAgentSchema[]` 改为 `MountedSubagentSummary[]`

#### 新增 Schema
- `MountSubagentRequest`: 挂载请求
- `MountedSubagentSummary`: 已挂载的 SubAgent 摘要
- `UpdateMountRequest`: 更新挂载配置

### 2. 新增 API 端点

```typescript
// 列出已挂载的 SubAgent
GET /api/v1/agents/{agent_id}/subagents
Response: MountedSubagentSummary[]

// 挂载 SubAgent
POST /api/v1/agents/{agent_id}/subagents
Body: MountSubagentRequest
Response: MountedSubagentSummary

// 更新挂载配置
PUT /api/v1/agents/{agent_id}/subagents/{child_id}
Body: UpdateMountRequest
Response: MountedSubagentSummary

// 卸载 SubAgent
DELETE /api/v1/agents/{agent_id}/subagents/{child_id}
Response: 204

// 批量替换 SubAgent
PUT /api/v1/agents/{agent_id}/subagents
Body: { subagents: MountSubagentRequest[] }
Response: MountedSubagentSummary[]

// 列出可挂载的候选 Agent
GET /api/v1/agents/{agent_id}/mountable?search=&page=1&page_size=20
Response: AgentListResponse
```

## TypeScript 类型定义

详见下一部分...


## TypeScript 类型定义

```typescript
// 挂载请求
interface MountSubagentRequest {
  agent_id: string;
  mount_description?: string;
  sort_order?: number;
}

// 已挂载的 SubAgent 摘要
interface MountedSubagentSummary {
  agent_id: string;
  name: string;
  description?: string;
  mount_description?: string;
  effective_description: string;
  model?: string;
  model_provider?: string;
  tools: string[];
  has_mcp_servers: boolean;
  sort_order: number;
}

// 更新挂载请求
interface UpdateMountRequest {
  mount_description?: string;
  sort_order?: number;
}

// Agent 创建请求（新增字段）
interface AgentCreate {
  name: string;
  description?: string;  // ← 新增
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  summarization?: SummarizationConfig;
  metadata?: Record<string, any>;
  mount_subagents?: MountSubagentRequest[];  // ← 新增（可选）
}

// Agent 响应（修改字段）
interface AgentResponse extends AgentCreate {
  id: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  subagents: MountedSubagentSummary[];  // ← 类型变更
  mcp_servers: McpServerResponse[];
}
```


## API 服务层实现示例

```typescript
// services/agentService.ts

class AgentService {
  // 创建 Agent（支持同时挂载 SubAgent）
  async createAgent(data: AgentCreate): Promise<AgentResponse> {
    const response = await api.post('/api/v1/agents', data);
    return response.data;
  }

  // 挂载 SubAgent
  async mountSubagent(
    agentId: string,
    request: MountSubagentRequest
  ): Promise<MountedSubagentSummary> {
    const response = await api.post(
      `/api/v1/agents/${agentId}/subagents`,
      request
    );
    return response.data;
  }

  // 列出已挂载的 SubAgent
  async listMountedSubagents(
    agentId: string
  ): Promise<MountedSubagentSummary[]> {
    const response = await api.get(`/api/v1/agents/${agentId}/subagents`);
    return response.data;
  }

  // 卸载 SubAgent
  async unmountSubagent(
    agentId: string,
    childId: string
  ): Promise<void> {
    await api.delete(`/api/v1/agents/${agentId}/subagents/${childId}`);
  }

  // 更新挂载配置
  async updateMount(
    agentId: string,
    childId: string,
    request: UpdateMountRequest
  ): Promise<MountedSubagentSummary> {
    const response = await api.put(
      `/api/v1/agents/${agentId}/subagents/${childId}`,
      request
    );
    return response.data;
  }

  // 列出可挂载的候选 Agent
  async listMountableAgents(
    agentId: string,
    params?: { search?: string; page?: number; page_size?: number }
  ): Promise<AgentListResponse> {
    const response = await api.get(
      `/api/v1/agents/${agentId}/mountable`,
      { params }
    );
    return response.data;
  }

  // 批量替换 SubAgent
  async replaceSubagents(
    agentId: string,
    subagents: MountSubagentRequest[]
  ): Promise<MountedSubagentSummary[]> {
    const response = await api.put(
      `/api/v1/agents/${agentId}/subagents`,
      { subagents }
    );
    return response.data;
  }
}

export const agentService = new AgentService();
```


## React 组件示例

### 1. Agent 创建/编辑表单

```tsx
// components/AgentForm.tsx
import { useState } from 'react';
import { AgentCreate, MountSubagentRequest } from '@/types/agent';

interface AgentFormProps {
  initialData?: AgentResponse;
  onSubmit: (data: AgentCreate) => Promise<void>;
}

export function AgentForm({ initialData, onSubmit }: AgentFormProps) {
  const [formData, setFormData] = useState<AgentCreate>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    model: initialData?.model || 'gpt-4o-mini',
    system_prompt: initialData?.system_prompt || '',
    // ...
  });

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>名称</label>
        <input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div>
        <label>描述</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="描述此 Agent 的通用能力，用于被挂载为 SubAgent 时的任务匹配"
        />
      </div>

      {/* 其他字段... */}

      <SubAgentSection agentId={initialData?.id} />

      <button type="submit">保存</button>
    </form>
  );
}
```


### 2. SubAgent 管理组件

```tsx
// components/SubAgentSection.tsx
import { useState, useEffect } from 'react';
import { agentService } from '@/services/agentService';
import { MountedSubagentSummary } from '@/types/agent';

interface SubAgentSectionProps {
  agentId?: string;
}

export function SubAgentSection({ agentId }: SubAgentSectionProps) {
  const [mountedSubagents, setMountedSubagents] = useState<MountedSubagentSummary[]>([]);
  const [showSelector, setShowSelector] = useState(false);

  useEffect(() => {
    if (agentId) {
      loadMountedSubagents();
    }
  }, [agentId]);

  const loadMountedSubagents = async () => {
    if (!agentId) return;
    const subagents = await agentService.listMountedSubagents(agentId);
    setMountedSubagents(subagents);
  };

  const handleUnmount = async (childId: string) => {
    if (!agentId) return;
    await agentService.unmountSubagent(agentId, childId);
    await loadMountedSubagents();
  };

  return (
    <div className="subagent-section">
      <h3>SubAgent (子代理)</h3>
      
      <div className="actions">
        <button onClick={() => setShowSelector(true)}>
          + 选择已有 Agent
        </button>
        <button onClick={() => setShowQuickCreate(true)}>
          + 快速新建
        </button>
      </div>

      <div className="mounted-list">
        {mountedSubagents.map((subagent) => (
          <SubAgentCard
            key={subagent.agent_id}
            subagent={subagent}
            onUnmount={handleUnmount}
            onEdit={(childId) => setEditingMount(childId)}
          />
        ))}
      </div>

      {showSelector && (
        <AgentSelectorModal
          agentId={agentId}
          onSelect={handleMount}
          onClose={() => setShowSelector(false)}
        />
      )}
    </div>
  );
}
```


### 3. Agent 选择器弹窗

```tsx
// components/AgentSelectorModal.tsx
import { useState, useEffect } from 'react';
import { agentService } from '@/services/agentService';
import { AgentResponse, MountSubagentRequest } from '@/types/agent';

interface AgentSelectorModalProps {
  agentId?: string;
  onSelect: (request: MountSubagentRequest) => Promise<void>;
  onClose: () => void;
}

export function AgentSelectorModal({ agentId, onSelect, onClose }: AgentSelectorModalProps) {
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mountDescription, setMountDescription] = useState('');

  useEffect(() => {
    loadMountableAgents();
  }, [search]);

  const loadMountableAgents = async () => {
    if (!agentId) return;
    const response = await agentService.listMountableAgents(agentId, { search });
    setAgents(response.items);
  };

  const handleMount = async () => {
    if (!selectedId) return;
    
    await onSelect({
      agent_id: selectedId,
      mount_description: mountDescription || undefined,
      sort_order: 0,
    });
    
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>选择 Agent 作为 SubAgent</h2>
        
        <input
          type="text"
          placeholder="搜索 Agent 名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="agent-list">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`agent-item ${selectedId === agent.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(agent.id)}
            >
              <div className="agent-name">🤖 {agent.name}</div>
              <div className="agent-description">{agent.description}</div>
              <div className="agent-meta">
                模型: {agent.model} | MCP: {agent.mcp_servers.length}
              </div>
            </div>
          ))}
        </div>

        <div className="mount-config">
          <label>角色描述 (可选)</label>
          <textarea
            placeholder="在当前 Agent 中负责什么角色..."
            value={mountDescription}
            onChange={(e) => setMountDescription(e.target.value)}
          />
        </div>

        <div className="actions">
          <button onClick={onClose}>取消</button>
          <button onClick={handleMount} disabled={!selectedId}>
            挂载
          </button>
        </div>
      </div>
    </div>
  );
}
```


### 4. SubAgent 卡片组件

```tsx
// components/SubAgentCard.tsx
import { MountedSubagentSummary } from '@/types/agent';

interface SubAgentCardProps {
  subagent: MountedSubagentSummary;
  onUnmount: (childId: string) => void;
  onEdit: (childId: string) => void;
}

export function SubAgentCard({ subagent, onUnmount, onEdit }: SubAgentCardProps) {
  return (
    <div className="subagent-card">
      <div className="header">
        <span className="icon">🤖</span>
        <span className="name">{subagent.name}</span>
        <span className="model">({subagent.model})</span>
      </div>

      <div className="description">
        <strong>角色:</strong> {subagent.effective_description}
      </div>

      <div className="meta">
        {subagent.has_mcp_servers && <span className="badge">MCP ✓</span>}
        {subagent.tools.length > 0 && (
          <span className="badge">工具: {subagent.tools.length}</span>
        )}
      </div>

      <div className="actions">
        <button onClick={() => onEdit(subagent.agent_id)}>编辑角色</button>
        <button onClick={() => onUnmount(subagent.agent_id)}>卸载</button>
      </div>
    </div>
  );
}
```

## 迁移步骤

### 第一阶段：类型定义更新

1. 更新 `types/agent.ts` 中的类型定义
2. 添加新的 Schema 类型
3. 更新现有的 `AgentResponse` 类型

### 第二阶段：API 服务层

1. 更新 `services/agentService.ts`
2. 添加新的挂载管理方法
3. 保留旧方法用于向后兼容

### 第三阶段：组件改造

1. 修改 `AgentForm` 组件，添加 `description` 字段
2. 重写 `SubAgentSection` 组件
3. 创建 `AgentSelectorModal` 组件
4. 创建 `SubAgentCard` 组件

### 第四阶段：Agent 列表页

1. 显示 Agent 的 `description`
2. 显示"被 X 个 Agent 使用"计数
3. 删除时提示影响范围

### 第五阶段：测试

1. 测试创建 Agent 并挂载 SubAgent
2. 测试挂载/卸载操作
3. 测试循环引用防护
4. 测试跨父级复用场景

## 注意事项

1. **向后兼容**：保留旧的内联创建模式，逐步迁移
2. **错误处理**：处理循环引用、重复挂载等错误
3. **用户提示**：删除被使用的 Agent 时提示影响范围
4. **性能优化**：使用分页加载可挂载的 Agent 列表
5. **缓存管理**：修改 Agent 后刷新相关列表

## 完成标志

- ✅ 所有类型定义已更新
- ✅ API 服务层已实现
- ✅ 组件已改造完成
- ✅ 测试用例已通过
- ✅ 用户文档已更新
