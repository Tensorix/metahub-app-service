# Step 9: 前端详细设计与实施方案

## 概述

基于现有前端技术栈（React 18 + TypeScript + shadcn/ui + Zustand + Axios），详细定义 Agent 统一抽象所需的全部前端变更。

**技术栈确认**：
| 技术 | 用途 |
|------|------|
| React 18 + TypeScript | UI 框架 |
| shadcn/ui + Radix UI | 组件库 |
| Tailwind CSS 4 | 样式 |
| Zustand | 状态管理 |
| Axios | HTTP 客户端 |
| @dnd-kit | 拖拽排序 |
| Lucide React | 图标 |

**涉及文件清单**：

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | `frontend/src/lib/agentManagementApi.ts` | 类型定义 + 新增挂载 API |
| 修改 | `frontend/src/components/AgentDialog.tsx` | 重构子代理 Tab |
| 修改 | `frontend/src/pages/Agents.tsx` | 列表页新增信息展示 |
| 新增 | `frontend/src/components/AgentSelectorDialog.tsx` | 选择已有 Agent 弹窗 |
| 新增 | `frontend/src/components/QuickCreateAgentDialog.tsx` | 快速创建 Agent 弹窗 |
| 新增 | `frontend/src/components/SubAgentSection.tsx` | 子代理管理区域组件 |
| 新增 | `frontend/src/components/DeleteAgentDialog.tsx` | 删除确认弹窗（含影响分析） |

---

## 9.1 TypeScript 类型定义变更

### 文件: `frontend/src/lib/agentManagementApi.ts`

#### 废弃的类型

```typescript
// ❌ 删除：内嵌 SubAgent 配置
export interface SubAgent {
  id?: string;
  name: string;
  description: string;
  system_prompt?: string;
  model?: string;
  tools?: string[];
}
```

#### 新增的类型

```typescript
// ============================================================
// SubAgent 挂载相关类型
// ============================================================

/**
 * MountSubagentRequest - 挂载一个已有 Agent 作为 SubAgent
 */
export interface MountSubagentRequest {
  /** 要挂载的 Agent ID */
  agent_id: string;
  /** 在当前 Agent 上下文中的角色描述 (可选，覆盖子 Agent 的通用 description) */
  mount_description?: string;
  /** 排序序号，默认 0 */
  sort_order?: number;
}

/**
 * UpdateMountRequest - 更新已挂载 SubAgent 的配置
 */
export interface UpdateMountRequest {
  mount_description?: string;
  sort_order?: number;
}

/**
 * BatchMountSubagentRequest - 批量替换所有 SubAgent
 */
export interface BatchMountSubagentRequest {
  subagents: MountSubagentRequest[];
}

/**
 * MountedSubagentSummary - 已挂载的 SubAgent 摘要信息
 * API 返回的 SubAgent 视图，包含子 Agent 的关键信息
 */
export interface MountedSubagentSummary {
  /** 子 Agent ID */
  agent_id: string;
  /** 子 Agent 名称 */
  name: string;
  /** 子 Agent 通用描述 */
  description?: string;
  /** 在父 Agent 上下文中的角色描述 */
  mount_description?: string;
  /** 生效的描述 (mount_description ?? description) */
  effective_description: string;
  /** 子 Agent 使用的模型 */
  model?: string;
  /** 模型提供商 */
  model_provider?: string;
  /** 子 Agent 的工具列表 */
  tools: string[];
  /** 是否配置了 MCP Servers */
  has_mcp_servers: boolean;
  /** 排序序号 */
  sort_order: number;
}
```

#### 修改的类型

```diff
  export interface Agent {
    id: string;
    name: string;
+   description?: string;                        // ← 新增
    system_prompt?: string;
    model?: string;
    model_provider?: string;
    temperature?: number;
    max_tokens?: number;
    tools?: string[];
    skills?: SkillContent[];
    memory_files?: MemoryContent[];
-   subagents?: SubAgent[];
+   subagents?: MountedSubagentSummary[];         // ← 类型变更
    mcp_servers?: McpServerResponse[];
    summarization?: SummarizationConfig;
    metadata?: Record<string, any>;
+   parent_agents_count?: number;                 // ← 新增：被多少个父 Agent 使用
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
  }

  export interface AgentCreate {
    name: string;
+   description?: string;                        // ← 新增
    system_prompt?: string;
    model?: string;
    model_provider?: string;
    temperature?: number;
    max_tokens?: number;
    tools?: string[];
    skills?: SkillContent[];
    memory_files?: MemoryContent[];
-   subagents?: SubAgent[];
+   mount_subagents?: MountSubagentRequest[];     // ← 替换（创建时可选内联挂载）
    summarization?: SummarizationConfig;
    metadata?: Record<string, any>;
  }

  export interface AgentUpdate {
    name?: string;
+   description?: string;                        // ← 新增
    system_prompt?: string;
    model?: string;
    model_provider?: string;
    temperature?: number;
    max_tokens?: number;
    tools?: string[];
    skills?: SkillContent[];
    memory_files?: MemoryContent[];
-   subagents?: SubAgent[];
+   // subagents 字段移除 — SubAgent 通过独立 API 管理
    summarization?: SummarizationConfig;
    metadata?: Record<string, any>;
  }
```

---

## 9.2 API 层新增方法

### 文件: `frontend/src/lib/agentManagementApi.ts`

在 `agentManagementApi` 对象中新增以下方法：

```typescript
export const agentManagementApi = {
  // ... 保留现有 CRUD 方法 ...

  // ============================================================
  // SubAgent 挂载管理
  // ============================================================

  /**
   * 列出已挂载的 SubAgent
   */
  async listSubagents(agentId: string): Promise<MountedSubagentSummary[]> {
    const response = await api.get<MountedSubagentSummary[]>(
      `/api/v1/agents/${agentId}/subagents`
    );
    return response.data;
  },

  /**
   * 挂载一个 Agent 作为 SubAgent
   */
  async mountSubagent(
    agentId: string,
    data: MountSubagentRequest
  ): Promise<MountedSubagentSummary> {
    const response = await api.post<MountedSubagentSummary>(
      `/api/v1/agents/${agentId}/subagents`,
      data
    );
    return response.data;
  },

  /**
   * 更新已挂载 SubAgent 的配置
   */
  async updateMount(
    agentId: string,
    childId: string,
    data: UpdateMountRequest
  ): Promise<MountedSubagentSummary> {
    const response = await api.put<MountedSubagentSummary>(
      `/api/v1/agents/${agentId}/subagents/${childId}`,
      data
    );
    return response.data;
  },

  /**
   * 卸载 SubAgent
   */
  async unmountSubagent(agentId: string, childId: string): Promise<void> {
    await api.delete(`/api/v1/agents/${agentId}/subagents/${childId}`);
  },

  /**
   * 批量替换所有 SubAgent
   */
  async replaceSubagents(
    agentId: string,
    data: BatchMountSubagentRequest
  ): Promise<MountedSubagentSummary[]> {
    const response = await api.put<MountedSubagentSummary[]>(
      `/api/v1/agents/${agentId}/subagents`,
      data
    );
    return response.data;
  },

  /**
   * 列出可挂载的候选 Agent（排除自身、已挂载、祖先）
   */
  async listMountableAgents(
    agentId: string,
    params?: { search?: string; page?: number; page_size?: number }
  ): Promise<AgentListResponse> {
    const response = await api.get<AgentListResponse>(
      `/api/v1/agents/${agentId}/mountable`,
      { params }
    );
    return response.data;
  },

  /**
   * 列出将此 Agent 作为 SubAgent 的所有父 Agent
   * 用于删除前的影响分析
   */
  async listParentAgents(agentId: string): Promise<Agent[]> {
    const response = await api.get<Agent[]>(
      `/api/v1/agents/${agentId}/parents`
    );
    return response.data;
  },
};
```

---

## 9.3 AgentDialog 组件重构

### 文件: `frontend/src/components/AgentDialog.tsx`

#### 核心变更

1. **表单 state**：`formData.subagents` 从 `SubAgent[]` 改为 `MountSubagentRequest[]`
2. **基础配置 Tab**：新增 `description` 字段
3. **子代理 Tab**：完全重写，从内联表单改为选择器模式
4. **新增状态**：`mountedSubagents: MountedSubagentSummary[]` 用于展示已挂载列表

#### 状态定义变更

```diff
  // 当前
  const [formData, setFormData] = useState<AgentCreate>({
    name: '',
    system_prompt: '',
    model: 'gpt-4o-mini',
    model_provider: 'openai',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    skills: [],
    memory_files: [],
-   subagents: [],
    summarization: { enabled: false, max_messages: 50, keep_last_n: 20 },
  });

- // SubAgent form state（删除）
- const [editingSubAgent, setEditingSubAgent] = useState<SubAgent | null>(null);
- const [subAgentForm, setSubAgentForm] = useState<SubAgent>({...});

  // 新增
+ const [mountedSubagents, setMountedSubagents] = useState<MountedSubagentSummary[]>([]);
+ const [selectorOpen, setSelectorOpen] = useState(false);
+ const [quickCreateOpen, setQuickCreateOpen] = useState(false);
```

#### useEffect 初始化变更

```diff
  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
+       description: agent.description || '',
        system_prompt: agent.system_prompt || '',
        model: agent.model || 'gpt-4o-mini',
        // ... 其余不变
-       subagents: agent.subagents || [],
      });
+     setMountedSubagents(agent.subagents || []);
      setMcpServers(agent.mcp_servers || []);
    } else {
      setFormData({
        name: '',
+       description: '',
        system_prompt: '',
        // ... 其余不变
-       subagents: [],
      });
+     setMountedSubagents([]);
      setMcpServers([]);
    }
  }, [agent, open]);
```

#### 基础配置 Tab 新增 description 字段

在 `name` 输入框后添加：

```tsx
{/* Basic Tab - name 之后 */}
<div className="grid gap-2">
  <Label htmlFor="description">描述</Label>
  <Input
    id="description"
    value={formData.description || ''}
    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
    placeholder="Agent 的能力描述，被挂载为 SubAgent 时用于任务匹配"
  />
  <p className="text-xs text-muted-foreground">
    当此 Agent 被其他 Agent 挂载为子代理时，父 Agent 根据此描述决定是否委派任务
  </p>
</div>
```

#### 子代理 Tab 完全重写

```tsx
{activeTab === 'subagents' && (
  <SubAgentSection
    agentId={agent?.id}
    mountedSubagents={mountedSubagents}
    onMountedChange={setMountedSubagents}
  />
)}
```

> 子代理 Tab 的全部逻辑抽取到独立的 `SubAgentSection` 组件，保持 `AgentDialog` 职责清晰。

#### handleSubmit 变更

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  try {
    if (agent) {
      // 编辑模式：更新 Agent 基本信息
      await onSubmit(formData);
      // SubAgent 挂载在 SubAgentSection 中实时管理，不需要在 submit 时处理
    } else {
      // 创建模式：可选内联挂载
      const createData: AgentCreate = {
        ...formData,
        mount_subagents: mountedSubagents.map((sa) => ({
          agent_id: sa.agent_id,
          mount_description: sa.mount_description,
          sort_order: sa.sort_order,
        })),
      };
      await onSubmit(createData);
    }
    onOpenChange(false);
  } finally {
    setLoading(false);
  }
};
```

#### 删除的函数

```diff
- const addOrUpdateSubAgent = () => { ... };
- const editSubAgent = (sa: SubAgent) => { ... };
- const removeSubAgent = (name: string) => { ... };
- const toggleSubAgentTool = (tool: string) => { ... };
```

---

## 9.4 新增组件: SubAgentSection

### 文件: `frontend/src/components/SubAgentSection.tsx`

子代理管理的核心组件，包含已挂载列表 + 拖拽排序 + 挂载/卸载操作。

```tsx
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Plus, Link2, X, GripVertical, ExternalLink, Server, Pencil,
} from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { MountedSubagentSummary, UpdateMountRequest } from '@/lib/agentManagementApi';
import { AgentSelectorDialog } from './AgentSelectorDialog';
import { QuickCreateAgentDialog } from './QuickCreateAgentDialog';
import { useToast } from '@/hooks/use-toast';

// 可选: 拖拽排序
// import { DndContext, closestCenter } from '@dnd-kit/core';
// import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface SubAgentSectionProps {
  /** 当前 Agent ID（编辑模式有值，创建模式为 undefined） */
  agentId?: string;
  /** 已挂载的 SubAgent 列表 */
  mountedSubagents: MountedSubagentSummary[];
  /** 挂载列表变更回调 */
  onMountedChange: (subagents: MountedSubagentSummary[]) => void;
}

export function SubAgentSection({
  agentId,
  mountedSubagents,
  onMountedChange,
}: SubAgentSectionProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [editingMount, setEditingMount] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const { toast } = useToast();

  // ── 挂载回调 ──
  const handleMount = useCallback(
    async (selectedAgentId: string, mountDescription?: string) => {
      if (agentId) {
        // 编辑模式：直接调 API
        try {
          const result = await agentManagementApi.mountSubagent(agentId, {
            agent_id: selectedAgentId,
            mount_description: mountDescription,
            sort_order: mountedSubagents.length,
          });
          onMountedChange([...mountedSubagents, result]);
          toast({ title: '挂载成功' });
        } catch (error: any) {
          toast({
            title: '挂载失败',
            description: error.response?.data?.detail || '未知错误',
            variant: 'destructive',
          });
        }
      } else {
        // 创建模式：暂存到本地 state（创建 Agent 时一起提交）
        // 需要先获取子 Agent 的基本信息用于展示
        try {
          const childAgent = await agentManagementApi.getAgent(selectedAgentId);
          const summary: MountedSubagentSummary = {
            agent_id: childAgent.id,
            name: childAgent.name,
            description: childAgent.description,
            mount_description: mountDescription,
            effective_description: mountDescription || childAgent.description || '',
            model: childAgent.model,
            model_provider: childAgent.model_provider,
            tools: childAgent.tools || [],
            has_mcp_servers: (childAgent.mcp_servers || []).length > 0,
            sort_order: mountedSubagents.length,
          };
          onMountedChange([...mountedSubagents, summary]);
        } catch {
          toast({
            title: '获取 Agent 信息失败',
            variant: 'destructive',
          });
        }
      }
      setSelectorOpen(false);
    },
    [agentId, mountedSubagents, onMountedChange, toast]
  );

  // ── 卸载回调 ──
  const handleUnmount = useCallback(
    async (childId: string) => {
      if (agentId) {
        try {
          await agentManagementApi.unmountSubagent(agentId, childId);
          toast({ title: '已卸载' });
        } catch (error: any) {
          toast({
            title: '卸载失败',
            description: error.response?.data?.detail || '未知错误',
            variant: 'destructive',
          });
          return;
        }
      }
      onMountedChange(mountedSubagents.filter((sa) => sa.agent_id !== childId));
    },
    [agentId, mountedSubagents, onMountedChange, toast]
  );

  // ── 更新挂载描述 ──
  const handleUpdateDescription = useCallback(
    async (childId: string) => {
      if (agentId) {
        try {
          await agentManagementApi.updateMount(agentId, childId, {
            mount_description: editDescription,
          });
        } catch (error: any) {
          toast({
            title: '更新失败',
            variant: 'destructive',
          });
          return;
        }
      }
      onMountedChange(
        mountedSubagents.map((sa) =>
          sa.agent_id === childId
            ? {
                ...sa,
                mount_description: editDescription,
                effective_description: editDescription || sa.description || '',
              }
            : sa
        )
      );
      setEditingMount(null);
      setEditDescription('');
    },
    [agentId, editDescription, mountedSubagents, onMountedChange, toast]
  );

  // ── 快速创建后自动挂载 ──
  const handleQuickCreate = useCallback(
    async (newAgentId: string) => {
      setQuickCreateOpen(false);
      await handleMount(newAgentId);
    },
    [handleMount]
  );

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">
          子代理 ({mountedSubagents.length})
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectorOpen(true)}
          >
            <Link2 className="h-4 w-4 mr-2" />
            选择已有 Agent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            快速新建
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        将已有的 Agent 挂载为子代理。主 Agent 可以在对话中将任务委派给子代理处理。
        子代理拥有独立的工具、MCP Server 和模型配置。
      </p>

      {/* 已挂载列表 */}
      {mountedSubagents.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground">暂无子代理</p>
          <p className="text-xs text-muted-foreground mt-1">
            点击「选择已有 Agent」挂载子代理，或「快速新建」创建并挂载
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mountedSubagents.map((sa) => (
            <div
              key={sa.agent_id}
              className="border rounded-lg p-4 space-y-2 hover:border-primary/50 transition-colors"
            >
              {/* 头部：名称 + 操作按钮 */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{sa.name}</span>
                      {sa.model && (
                        <Badge variant="secondary" className="text-xs">
                          {sa.model}
                        </Badge>
                      )}
                      {sa.model_provider && sa.model_provider !== 'openai' && (
                        <Badge variant="outline" className="text-xs">
                          {sa.model_provider}
                        </Badge>
                      )}
                      {sa.has_mcp_servers && (
                        <Badge variant="outline" className="text-xs">
                          <Server className="h-3 w-3 mr-1" />
                          MCP
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingMount(sa.agent_id);
                      setEditDescription(sa.mount_description || '');
                    }}
                    title="编辑角色描述"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(`/agents?edit=${sa.agent_id}`, '_blank')}
                    title="打开 Agent 详情"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleUnmount(sa.agent_id)}
                    title="卸载"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* 角色描述 */}
              {editingMount === sa.agent_id ? (
                <div className="flex gap-2 pl-7">
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="在当前 Agent 中负责什么角色..."
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleUpdateDescription(sa.agent_id)}
                  >
                    保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingMount(null)}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pl-7">
                  {sa.effective_description || '(无描述)'}
                </p>
              )}

              {/* 工具 Badge */}
              {sa.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-7">
                  {sa.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 弹窗 */}
      <AgentSelectorDialog
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        parentAgentId={agentId}
        excludeIds={mountedSubagents.map((sa) => sa.agent_id)}
        onSelect={handleMount}
      />

      <QuickCreateAgentDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={handleQuickCreate}
      />
    </div>
  );
}
```

---

## 9.5 新增组件: AgentSelectorDialog

### 文件: `frontend/src/components/AgentSelectorDialog.tsx`

选择已有 Agent 作为 SubAgent 的弹窗，调用 `GET /agents/{id}/mountable` API。

```tsx
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Search, Bot, Server, CheckCircle2 } from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent } from '@/lib/agentManagementApi';

interface AgentSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 父 Agent ID（编辑模式用于调 mountable API，创建模式为 undefined） */
  parentAgentId?: string;
  /** 已挂载的 Agent ID，需要排除 */
  excludeIds: string[];
  /** 选择回调 */
  onSelect: (agentId: string, mountDescription?: string) => void;
}

export function AgentSelectorDialog({
  open,
  onOpenChange,
  parentAgentId,
  excludeIds,
  onSelect,
}: AgentSelectorDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mountDescription, setMountDescription] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // 加载候选列表
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      if (parentAgentId) {
        // 编辑模式：调用 mountable API（后端自动排除自身/祖先/已挂载）
        const response = await agentManagementApi.listMountableAgents(
          parentAgentId,
          { search: search || undefined, page, page_size: 10 }
        );
        setAgents(response.items);
        setTotal(response.total);
      } else {
        // 创建模式：调用普通列表 API，前端排除已选
        const response = await agentManagementApi.listAgents({
          search: search || undefined,
          page,
          page_size: 10,
        });
        const filtered = response.items.filter(
          (a) => !excludeIds.includes(a.id)
        );
        setAgents(filtered);
        setTotal(response.total);
      }
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [parentAgentId, excludeIds, search, page]);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setMountDescription('');
      setSearch('');
      setPage(1);
      loadAgents();
    }
  }, [open]);

  // 搜索防抖
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(loadAgents, 300);
    return () => clearTimeout(timer);
  }, [search, page]);

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId, mountDescription || undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>选择 Agent 作为子代理</DialogTitle>
          <DialogDescription>
            选择一个已有的 Agent 挂载为当前 Agent 的子代理
          </DialogDescription>
        </DialogHeader>

        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4
                             text-muted-foreground" />
          <Input
            placeholder="搜索 Agent 名称或描述..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>

        {/* Agent 列表 */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px] max-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Bot className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? '没有找到匹配的 Agent' : '没有可挂载的 Agent'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                你可以先创建 Agent，再回来挂载
              </p>
            </div>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={`w-full text-left p-3 rounded-lg border transition-colors
                  ${selectedId === agent.id
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:bg-muted/50'
                  }`}
                onClick={() => setSelectedId(agent.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{agent.name}</span>
                      {selectedId === agent.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-sm text-muted-foreground mt-1 ml-6">
                        {agent.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 ml-6">
                      <Badge variant="secondary" className="text-xs">
                        {agent.model || 'gpt-4o-mini'}
                      </Badge>
                      {agent.model_provider && agent.model_provider !== 'openai' && (
                        <Badge variant="outline" className="text-xs">
                          {agent.model_provider}
                        </Badge>
                      )}
                      {(agent.mcp_servers || []).length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Server className="h-3 w-3 mr-1" />
                          MCP: {agent.mcp_servers!.length}
                        </Badge>
                      )}
                      {(agent.tools || []).length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {agent.tools!.length} 工具
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* 分页 */}
        {total > 10 && (
          <div className="flex items-center justify-center gap-2 py-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {Math.ceil(total / 10)}
            </span>
            <Button
              variant="ghost" size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 10)}
            >
              下一页
            </Button>
          </div>
        )}

        {/* 角色描述 */}
        {selectedId && (
          <div className="space-y-2 border-t pt-3">
            <Label>角色描述 (可选)</Label>
            <Input
              value={mountDescription}
              onChange={(e) => setMountDescription(e.target.value)}
              placeholder="例如: 负责所有搜索任务"
            />
            <p className="text-xs text-muted-foreground">
              指定此子代理在当前 Agent 中的角色定位，留空则使用子代理的通用描述
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!selectedId}
            onClick={handleConfirm}
          >
            挂载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 9.6 新增组件: QuickCreateAgentDialog

### 文件: `frontend/src/components/QuickCreateAgentDialog.tsx`

快速创建 Agent 并自动挂载的弹窗。表单简化，只包含核心字段。

```tsx
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { X, Info } from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { AgentCreate } from '@/lib/agentManagementApi';
import { useTools } from '@/hooks/useTools';
import { useToast } from '@/hooks/use-toast';

interface QuickCreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 创建完成回调，传回新 Agent ID */
  onCreated: (agentId: string) => void;
}

export function QuickCreateAgentDialog({
  open, onOpenChange, onCreated,
}: QuickCreateAgentDialogProps) {
  const { tools, categories } = useTools();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<AgentCreate>({
    name: '',
    description: '',
    system_prompt: '',
    model: 'gpt-4o-mini',
    model_provider: 'openai',
    tools: [],
  });

  const toggleTool = (toolName: string) => {
    const current = form.tools || [];
    setForm({
      ...form,
      tools: current.includes(toolName)
        ? current.filter((t) => t !== toolName)
        : [...current, toolName],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const agent = await agentManagementApi.createAgent(form);
      toast({ title: '创建成功', description: `已创建 Agent「${agent.name}」` });
      onCreated(agent.id);
      // 重置表单
      setForm({
        name: '', description: '', system_prompt: '',
        model: 'gpt-4o-mini', model_provider: 'openai', tools: [],
      });
    } catch (error: any) {
      toast({
        title: '创建失败',
        description: error.response?.data?.detail || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>快速创建 Agent</DialogTitle>
          <DialogDescription>
            创建一个新 Agent 并自动挂载为子代理
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="qc-name">名称 *</Label>
            <Input
              id="qc-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如: 搜索专家"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qc-desc">描述 *</Label>
            <Input
              id="qc-desc"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="例如: 擅长网络搜索和信息检索"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="qc-model">模型</Label>
              <Input
                id="qc-model"
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qc-provider">提供商</Label>
              <Input
                id="qc-provider"
                value={form.model_provider || ''}
                onChange={(e) => setForm({ ...form, model_provider: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qc-prompt">系统提示词</Label>
            <textarea
              id="qc-prompt"
              className="flex min-h-[80px] w-full rounded-md border border-input
                         bg-background px-3 py-2 text-sm"
              value={form.system_prompt || ''}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="你是一个..."
            />
          </div>

          <div className="grid gap-2">
            <Label>工具</Label>
            <div className="space-y-2">
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase">
                      {cat.category}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.tools.map((tool) => {
                        const selected = (form.tools || []).includes(tool.name);
                        return (
                          <Badge
                            key={tool.name}
                            variant={selected ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleTool(tool.name)}
                            title={tool.description}
                          >
                            {tool.name}
                            {selected && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tools.map((tool) => (
                    <Badge
                      key={tool.name}
                      variant={(form.tools || []).includes(tool.name) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleTool(tool.name)}
                    >
                      {tool.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              创建后将自动挂载为当前 Agent 的子代理。你可以稍后在 Agent 列表中编辑此
              Agent，配置 MCP Server、Skills、Memory 等高级功能。
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading || !form.name.trim()}>
              {loading ? '创建中...' : '创建并挂载'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 9.7 新增组件: DeleteAgentDialog

### 文件: `frontend/src/components/DeleteAgentDialog.tsx`

替代简单的 `window.confirm()`，当 Agent 被其他 Agent 引用时展示影响分析。

```tsx
import { useState, useEffect } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Bot } from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent } from '@/lib/agentManagementApi';

interface DeleteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent;
  onConfirm: () => void;
}

export function DeleteAgentDialog({
  open, onOpenChange, agent, onConfirm,
}: DeleteAgentDialogProps) {
  const [parentAgents, setParentAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && agent.id) {
      setLoading(true);
      agentManagementApi
        .listParentAgents(agent.id)
        .then(setParentAgents)
        .catch(() => setParentAgents([]))
        .finally(() => setLoading(false));
    }
  }, [open, agent.id]);

  const hasParents = parentAgents.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasParents && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            确认删除
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                确定要删除 Agent「<strong>{agent.name}</strong>」吗？此操作不可撤销。
              </p>

              {loading ? (
                <p className="text-sm text-muted-foreground">检查引用关系中...</p>
              ) : hasParents ? (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20
                                rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    ⚠️ 此 Agent 正在被以下 Agent 作为子代理使用：
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {parentAgents.map((pa) => (
                      <Badge key={pa.id} variant="secondary">
                        <Bot className="h-3 w-3 mr-1" />
                        {pa.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    删除后，以上 Agent 的子代理配置将自动移除「{agent.name}」。
                  </p>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground
                       hover:bg-destructive/90"
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

## 9.8 Agents 列表页改造

### 文件: `frontend/src/pages/Agents.tsx`

#### 卡片信息增强

```diff
  {/* 原 Features 区域 */}
  <div className="flex flex-wrap gap-2 text-xs">
-   {agent.subagents && agent.subagents.length > 0 && (
-     <Badge variant="secondary">
-       {agent.subagents.length} 子代理
-     </Badge>
-   )}
+   {agent.subagents && agent.subagents.length > 0 && (
+     <Badge variant="secondary" title={
+       agent.subagents.map(sa => sa.name).join(', ')
+     }>
+       {agent.subagents.length} 子代理
+     </Badge>
+   )}
+   {/* 新增：展示被引用计数 */}
+   {agent.parent_agents_count && agent.parent_agents_count > 0 && (
+     <Badge variant="outline" className="text-xs">
+       被 {agent.parent_agents_count} 个 Agent 使用
+     </Badge>
+   )}
    {agent.skills && agent.skills.length > 0 && (
      <Badge variant="secondary">{agent.skills.length} Skills</Badge>
    )}
    {/* MCP Servers 数量 */}
+   {agent.mcp_servers && agent.mcp_servers.length > 0 && (
+     <Badge variant="secondary">
+       {agent.mcp_servers.length} MCP
+     </Badge>
+   )}
  </div>
+
+ {/* 新增：描述展示 */}
+ {agent.description && (
+   <p className="text-xs text-muted-foreground italic">
+     {agent.description}
+   </p>
+ )}
```

#### 删除操作改造

```diff
- const handleDelete = async (agentId: string) => {
-   if (!confirm('确定要删除这个 Agent 吗？')) return;
-   try {
-     await agentManagementApi.deleteAgent(agentId);
-     toast({ title: '删除成功' });
-     loadAgents();
-   } catch { ... }
- };

+ const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
+
+ const handleDeleteConfirm = async () => {
+   if (!deleteTarget) return;
+   try {
+     await agentManagementApi.deleteAgent(deleteTarget.id);
+     toast({ title: '删除成功', description: 'Agent 已删除' });
+     loadAgents();
+   } catch (error) {
+     toast({ title: '删除失败', variant: 'destructive' });
+   }
+   setDeleteTarget(null);
+ };

  // 在按钮中:
  <Button
    size="sm" variant="outline"
-   onClick={() => handleDelete(agent.id)}
+   onClick={() => setDeleteTarget(agent)}
  >
    <Trash2 className="h-3 w-3" />
  </Button>

  // 在页面底部:
+ {deleteTarget && (
+   <DeleteAgentDialog
+     open={!!deleteTarget}
+     onOpenChange={(open) => !open && setDeleteTarget(null)}
+     agent={deleteTarget}
+     onConfirm={handleDeleteConfirm}
+   />
+ )}
```

---

## 9.9 状态管理变更

### Zustand Store 影响分析

| Store | 是否需要改 | 说明 |
|-------|-----------|------|
| `store/chat.ts` | **否** | Chat store 通过 Session 关联 Agent，不直接管理 Agent CRUD |
| `store/auth.ts` | **否** | 无关 |
| `store/theme.ts` | **否** | 无关 |

Agent 管理页 (`pages/Agents.tsx`) 使用**本地 state + API 直接调用**模式，不经过 Zustand。统一抽象后维持此模式不变，改动集中在组件层。

---

## 9.10 交互流程完整示例

### 场景 A: 创建主 Agent 并挂载已有 SubAgent

```
用户操作                        前端行为                          API 调用
────────────────────────────────────────────────────────────────────────────

1. 点击「创建 Agent」          → 打开 AgentDialog               —
2. 填写基础配置                → 更新 formData                  —
   (name, description, model)
3. 切到「子代理」Tab            → 渲染 SubAgentSection           —
4. 点击「选择已有 Agent」       → 打开 AgentSelectorDialog       GET /agents/{id}/mountable
                                                                (创建模式: GET /agents)
5. 搜索 "搜索专家"             → 防抖搜索 300ms                 GET .../mountable?search=搜索专家
6. 选中一个 Agent              → 高亮选中项                      —
7. 填写角色描述                → 更新 mountDescription           —
8. 点击「挂载」                → 关闭弹窗，更新本地列表          GET /agents/{childId}
                                                                (获取子 Agent 信息用于展示)
9. 点击「创建」                → 提交                           POST /agents/
                                 包含 mount_subagents 字段        { mount_subagents: [...] }
```

### 场景 B: 编辑模式实时挂载/卸载

```
用户操作                        前端行为                          API 调用
────────────────────────────────────────────────────────────────────────────

1. 编辑已有 Agent              → 打开 AgentDialog               GET /agents/{id}
                                 加载 mountedSubagents           (已包含 subagents)
2. 切到「子代理」Tab            → 渲染已挂载列表                  —
3. 点击「选择已有 Agent」       → 打开 AgentSelectorDialog       GET /agents/{id}/mountable
4. 选中 + 挂载                 → 实时调 API                     POST /agents/{id}/subagents
                                 列表即时更新
5. 点击已挂载项的 ✏️           → 展开角色描述编辑框               —
6. 修改描述 + 保存             → 实时调 API                     PUT /agents/{id}/subagents/{childId}
7. 点击 ✕ 卸载                → 实时调 API                     DELETE /agents/{id}/subagents/{childId}
                                 列表即时更新
```

> **关键设计决策**：编辑模式下 SubAgent 的挂载/卸载是**实时操作**（每次操作立即调 API），不随「保存」按钮批量提交。原因：
> 1. SubAgent 挂载是独立的关联关系，不属于 Agent 基本信息
> 2. 避免"用户改了半天挂载配置忘了点保存"的问题
> 3. 与 MCP Server 管理保持一致的交互模式（MCP Server 也是独立 CRUD）

### 场景 C: 快速创建 SubAgent

```
用户操作                        前端行为                          API 调用
────────────────────────────────────────────────────────────────────────────

1. 点击「快速新建」            → 打开 QuickCreateAgentDialog     —
2. 填写 name, description,    → 更新本地 form                   —
   model, tools
3. 点击「创建并挂载」          → 先创建，再挂载                  POST /agents/  (创建)
                                                                POST /agents/{parentId}/subagents (挂载)
                                                                 (编辑模式)
                                                                 或暂存到本地 (创建模式)
```

### 场景 D: 删除被引用的 Agent

```
用户操作                        前端行为                          API 调用
────────────────────────────────────────────────────────────────────────────

1. 点击删除按钮                → 打开 DeleteAgentDialog          GET /agents/{id}/parents
                                 加载父 Agent 列表
2. 看到影响提示:               → 展示警告信息                    —
   "被 全能助手, 客服 使用"
3. 点击「确认删除」            → 调用删除 API                    DELETE /agents/{id}
                                 刷新列表                        GET /agents (刷新)
```

---

## 9.11 文件变更清单汇总

| 操作 | 文件 | 变更行数(预估) | 说明 |
|------|------|--------------|------|
| **修改** | `lib/agentManagementApi.ts` | +80, -20 | 类型定义 + 6 个新 API 方法 |
| **修改** | `components/AgentDialog.tsx` | +30, -200 | 移除内联 SubAgent 表单，换成 SubAgentSection |
| **修改** | `pages/Agents.tsx` | +40, -10 | 卡片增强 + 删除弹窗 |
| **新增** | `components/SubAgentSection.tsx` | +220 | 子代理管理核心组件 |
| **新增** | `components/AgentSelectorDialog.tsx` | +180 | 选择已有 Agent 弹窗 |
| **新增** | `components/QuickCreateAgentDialog.tsx` | +170 | 快速创建 Agent 弹窗 |
| **新增** | `components/DeleteAgentDialog.tsx` | +80 | 删除确认弹窗（含影响分析） |
| **总计** | — | **+800, -230** | 净增约 570 行 |
