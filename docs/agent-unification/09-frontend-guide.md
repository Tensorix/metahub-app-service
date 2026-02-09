# Step 9: 前端适配指南

## 概述

前端需要适配的核心变化：
1. Agent 创建/编辑表单统一（不再区分 Agent 和 SubAgent）
2. SubAgent 配置区域从"内联表单"改为"选择已有 Agent"
3. 新增挂载管理交互

## 9.1 用户交互流程设计

### 创建 Agent（统一体验）

```
┌─────────────────────────────────────────┐
│           创建 Agent                     │
│                                          │
│  名称:     [全能助手              ]       │
│  描述:     [擅长综合任务处理        ]      │  ← 新增字段
│  模型:     [gpt-4o          ▾]           │
│  提供商:   [openai           ▾]          │
│  温度:     [0.7                ]         │
│  系统提示: [你是一个全能助手...    ]       │
│                                          │
│  工具:     [✓ web_search] [✓ read_file]  │
│                                          │
│  ┌──── SubAgent (子代理) ──────────────┐  │
│  │                                     │  │
│  │  [+ 选择已有 Agent]  [+ 快速新建]   │  │
│  │                                     │  │
│  │  ┌─────────────────────────────┐    │  │
│  │  │ 🤖 搜索专家  (gpt-4o-mini)  │    │  │
│  │  │  角色: 负责所有搜索任务      │    │  │
│  │  │  MCP: Google Search ✓       │    │  │
│  │  │       [编辑角色] [卸载]      │    │  │
│  │  └─────────────────────────────┘    │  │
│  │  ┌─────────────────────────────┐    │  │
│  │  │ 🤖 代码专家  (claude-4)     │    │  │
│  │  │  角色: 负责代码审查和编写    │    │  │
│  │  │  MCP: GitHub ✓              │    │  │
│  │  │       [编辑角色] [卸载]      │    │  │
│  │  └─────────────────────────────┘    │  │
│  │                                     │  │
│  └─────────────────────────────────────┘  │
│                                          │
│              [取消]  [创建]              │
└──────────────────────────────────────────┘
```

### "选择已有 Agent" 弹窗

```
┌─────────────────────────────────────────┐
│        选择 Agent 作为 SubAgent          │
│                                          │
│  搜索: [搜索 Agent 名称...       🔍]    │
│                                          │
│  ┌─────────────────────────────────┐     │
│  │ ○ 🤖 搜索专家                    │     │
│  │   擅长网络搜索和信息检索          │     │
│  │   模型: gpt-4o-mini | MCP: 2     │     │
│  ├─────────────────────────────────┤     │
│  │ ○ 🤖 代码专家                    │     │
│  │   擅长代码审查、编写和调试        │     │
│  │   模型: claude-4 | MCP: 1        │     │
│  ├─────────────────────────────────┤     │
│  │ ○ 🤖 数据分析师                  │     │
│  │   擅长数据分析和可视化            │     │
│  │   模型: gpt-4o | MCP: 0          │     │
│  └─────────────────────────────────┘     │
│                                          │
│  角色描述 (可选):                         │
│  [在当前 Agent 中负责什么角色...    ]     │
│                                          │
│              [取消]  [挂载]              │
└──────────────────────────────────────────┘
```

> **注意**：此列表调用 `GET /agents/{agent_id}/mountable` API，已自动排除自身、已挂载的、会造成循环引用的 Agent。

### "快速新建" 弹窗

```
┌─────────────────────────────────────────┐
│         快速创建 SubAgent                │
│                                          │
│  名称:     [                      ]      │
│  描述:     [                      ]      │
│  模型:     [gpt-4o-mini      ▾]          │
│  系统提示: [                      ]      │
│  工具:     [选择工具...           ]       │
│                                          │
│  💡 创建后将自动挂载为当前 Agent 的       │
│     SubAgent。你可以稍后在 Agent 列表    │
│     中为其配置 MCP Server 等高级功能。    │
│                                          │
│              [取消]  [创建并挂载]         │
└──────────────────────────────────────────┘
```

## 9.2 Agent 列表页变化

### 新增信息展示

```
┌─────────────────────────────────────────────────────────┐
│ Agent 列表                                    [+ 创建]  │
├─────────────────────────────────────────────────────────┤
│ 🤖 全能助手                                   gpt-4o    │
│    SubAgent: 搜索专家, 代码专家  |  MCP: 1              │
│    ─────────────────────────────────────────────────    │
│ 🤖 搜索专家                                gpt-4o-mini  │
│    被 2 个 Agent 使用  |  MCP: 2                        │ ← 新增：使用计数
│    ─────────────────────────────────────────────────    │
│ 🤖 代码专家                                  claude-4   │
│    被 1 个 Agent 使用  |  MCP: 1                        │
│    ─────────────────────────────────────────────────    │
│ 🤖 数据分析师                                  gpt-4o   │
│    未被使用  |  MCP: 0                                  │
└─────────────────────────────────────────────────────────┘
```

### 删除提示

当删除一个被其他 Agent 使用的 Agent 时：

```
┌───────────────────────────────────────┐
│ ⚠️  确认删除                          │
│                                       │
│ "搜索专家" 正在被以下 Agent 使用：     │
│                                       │
│  • 全能助手                           │
│  • 客服机器人                         │
│                                       │
│ 删除后，这些 Agent 的 SubAgent 配置    │
│ 将自动移除"搜索专家"。                │
│                                       │
│         [取消]  [确认删除]            │
└───────────────────────────────────────┘
```

## 9.3 API 调用变化对照

### 之前

```typescript
// 创建 Agent (含内嵌 SubAgent)
POST /agents/
{
  name: "全能助手",
  subagents: [
    { name: "搜索专家", description: "...", system_prompt: "...", tools: [...] },
    { name: "代码专家", description: "...", system_prompt: "...", tools: [...] },
  ]
}

// 更新时全量替换 SubAgent
PUT /agents/{id}
{
  subagents: [
    { name: "搜索专家v2", description: "...", ... },
  ]
}
```

### 之后

```typescript
// Step 1: 创建独立的 Agent
const searchAgent = await POST('/agents/', {
  name: "搜索专家",
  description: "擅长网络搜索和信息检索",
  model: "gpt-4o-mini",
  tools: ["web_search"],
});

// Step 2: 创建主 Agent 并挂载
const mainAgent = await POST('/agents/', {
  name: "全能助手",
  model: "gpt-4o",
  mount_subagents: [
    { agent_id: searchAgent.id, mount_description: "负责搜索任务" },
  ],
});

// 或者分步挂载
await POST(`/agents/${mainAgent.id}/subagents`, {
  agent_id: codeAgent.id,
  mount_description: "负责代码任务",
});

// 卸载
await DELETE(`/agents/${mainAgent.id}/subagents/${searchAgent.id}`);

// 查询可挂载的候选
const candidates = await GET(`/agents/${mainAgent.id}/mountable?search=专家`);
```

## 9.4 TypeScript 类型变化

```typescript
// ❌ 废弃
interface SubAgent {
  id?: string;
  name: string;
  description: string;
  system_prompt?: string;
  model?: string;
  tools?: string[];
}

// ✅ 新增
interface MountSubagentRequest {
  agent_id: string;
  mount_description?: string;
  sort_order?: number;
}

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

// AgentCreate 变化
interface AgentCreate {
  name: string;
  description?: string;        // ← 新增
  // ... 其余不变
  // subagents 移除
  mount_subagents?: MountSubagentRequest[];  // ← 新增（可选，快速创建模式）
}

// AgentResponse 变化
interface AgentResponse {
  id: string;
  name: string;
  description?: string;        // ← 新增
  // ... 其余不变
  subagents: MountedSubagentSummary[];  // ← 类型变更
}
```

## 9.5 前端组件变化

| 组件 | 变化 | 说明 |
|------|------|------|
| AgentForm | 新增 `description` 输入框 | 在 `name` 下方 |
| SubAgentSection | 重写 | 从内联表单改为选择器 + 挂载列表 |
| AgentSelector | 新增 | 选择已有 Agent 的弹窗组件 |
| QuickCreateAgent | 新增 | 快速创建 Agent 并自动挂载 |
| AgentList | 修改 | 展示被使用计数 |
| DeleteConfirm | 修改 | 展示影响的父 Agent 列表 |
