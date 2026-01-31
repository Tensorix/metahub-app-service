# Step 7: 前端 UI 组件

## 7.1 设计目标

在现有的 AgentDialog 中添加 "MCP Servers" 标签页，与现有的 "子代理"、"高级功能" 标签页并列。

## 7.2 UI 结构

```
AgentDialog
├── 基础配置 (现有)
├── 子代理 (现有)
├── 高级功能 (现有)
└── MCP Servers (新增)
    ├── MCP Server 列表
    │   ├── 服务器卡片 (可折叠)
    │   │   ├── 名称 + 启用开关
    │   │   ├── URL
    │   │   ├── Headers (key-value 编辑器)
    │   │   ├── 连接状态指示
    │   │   ├── 可用工具列表 (只读)
    │   │   ├── [测试连接] [编辑] [删除] 按钮
    │   │   └── 描述
    │   └── ...
    └── [+ 添加 MCP Server] 按钮
```

## 7.3 组件设计

### MCPServerConfig.tsx (主组件)

```tsx
/**
 * MCP Server 配置组件
 *
 * 作为 AgentDialog 的一个标签页，
 * 管理 Agent 关联的 MCP Server 列表。
 */

interface MCPServerConfigProps {
  agentId?: string;      // 编辑时有值，新建时无
  servers: McpServerResponse[];
  onChange: (servers: McpServerFormData[]) => void;
}

interface McpServerFormData {
  id?: string;           // 已保存的有 id
  name: string;
  description: string;
  url: string;
  headers: Record<string, string>;
  is_enabled: boolean;
  sort_order: number;
  // 运行时状态 (只读)
  last_connected_at?: string;
  last_error?: string;
  cached_tools?: McpToolInfo[];
}
```

**核心功能:**
1. 渲染 MCP Server 卡片列表
2. 添加新的 MCP Server（展开内联表单）
3. 编辑现有 MCP Server
4. 删除 MCP Server（确认对话框）
5. 切换启用/禁用状态
6. 测试连接并显示结果

### MCPServerCard.tsx (单个服务器卡片)

```tsx
/**
 * 单个 MCP Server 配置卡片
 *
 * 可折叠，展开后显示完整配置。
 * 包含连接状态指示器和操作按钮。
 */

interface MCPServerCardProps {
  server: McpServerFormData;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (data: McpServerFormData) => void;
  onCancel: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onTestConnection: () => void;
  testResult?: McpServerTestResult;
  isTesting: boolean;
}
```

**卡片布局:**

```
┌─────────────────────────────────────────────────┐
│ 🔌 database-tools              [启用/禁用] ☰    │
│ http://mcp-db-server:8080/mcp                   │
│ ● 已连接 · 3 个工具 · 延迟 156ms                 │
├─────────────────────────────────────────────────┤
│ (展开后)                                         │
│                                                  │
│ 描述: PostgreSQL database query tools            │
│                                                  │
│ Headers:                                         │
│ ┌──────────────┬──────────────────────┐          │
│ │ Authorization│ Bear****-xxx         │          │
│ └──────────────┴──────────────────────┘          │
│                                                  │
│ 可用工具:                                        │
│ • query_database - Execute SQL queries           │
│ • list_tables - List all database tables         │
│ • describe_table - Get table schema              │
│                                                  │
│ [测试连接]  [编辑]  [删除]                        │
└─────────────────────────────────────────────────┘
```

### HeaderEditor.tsx (Headers 键值对编辑器)

```tsx
/**
 * HTTP Headers 键值对编辑器
 *
 * 支持添加、编辑、删除 header 条目。
 * 敏感字段 (Authorization, API-Key 等) 值显示为密码输入。
 */

interface HeaderEditorProps {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
  readOnly?: boolean;
}
```

**布局:**

```
Headers:
┌──────────────┬──────────────────────┬───┐
│ Key          │ Value                │ ✕ │
├──────────────┼──────────────────────┼───┤
│ Authorization│ ●●●●●●●●●●          │ ✕ │
│ X-Custom     │ some-value           │ ✕ │
└──────────────┴──────────────────────┴───┘
[+ 添加 Header]
```

### MCPToolList.tsx (工具列表显示)

```tsx
/**
 * MCP 工具列表展示组件
 *
 * 只读展示从 MCP Server 获取的可用工具。
 * 在测试连接成功后显示，或从缓存数据显示。
 */

interface MCPToolListProps {
  tools: McpToolInfo[];
}
```

## 7.4 交互流程

### 添加 MCP Server

```
1. 用户点击 [+ 添加 MCP Server]
2. 展开内联表单:
   - 名称 (必填)
   - URL (必填)
   - 描述 (可选)
   - Headers (可选, key-value 编辑器)
3. 用户点击 [测试连接]
   → 调用 testMcpServer API
   → 显示连接结果和可用工具
4. 用户点击 [保存]
   → 调用 createMcpServer API
   → 卡片切换为只读模式
```

### 编辑 MCP Server

```
1. 用户点击卡片上的 [编辑]
2. 表单切换为可编辑模式
3. 用户修改配置
4. 可选: 重新测试连接
5. 点击 [保存] → 调用 updateMcpServer API
   或 [取消] → 恢复原值
```

### 测试连接

```
1. 用户点击 [测试连接]
2. 按钮显示 loading 状态
3. 调用 testMcpServer API
4. 成功:
   - 显示绿色 ✓ 和 "连接成功，发现 N 个工具"
   - 显示工具列表
   - 显示延迟
5. 失败:
   - 显示红色 ✕ 和错误信息
```

### 删除 MCP Server

```
1. 用户点击 [删除]
2. 弹出确认对话框: "确定要删除 MCP Server '{name}' 吗？"
3. 确认 → 调用 deleteMcpServer API → 移除卡片
4. 取消 → 关闭对话框
```

## 7.5 状态管理

在 AgentDialog 组件中管理 MCP Server 列表状态:

```typescript
// AgentDialog 中新增状态
const [mcpServers, setMcpServers] = useState<McpServerFormData[]>([]);

// 编辑模式加载
useEffect(() => {
  if (agent?.mcp_servers) {
    setMcpServers(agent.mcp_servers);
  }
}, [agent]);
```

### 新建 Agent 时的处理

新建 Agent 时 `agentId` 为空，MCP Server 需要在 Agent 创建成功后再保存。
两种方案:

**方案 A (推荐): Agent 创建后批量保存**
- 新建 Agent 时，MCP Server 配置暂存在前端状态
- Agent 保存成功后，遍历 MCP Server 列表逐个调用 createMcpServer
- 优点: 逻辑简单，复用现有 API
- 缺点: 非原子操作，可能部分成功

**方案 B: Agent 创建时一并提交**
- 在 AgentCreate schema 中包含 MCP Server 配置
- 后端在创建 Agent 时同时创建 MCP Server 记录
- 优点: 原子操作
- 缺点: 需要修改 Agent 创建逻辑

> 建议先用方案 A，后续如有需要再重构为方案 B。

## 7.6 连接状态指示器

```tsx
// 连接状态显示逻辑

function getConnectionStatus(server: McpServerFormData) {
  if (!server.is_enabled) {
    return { color: 'gray', text: '已禁用' };
  }
  if (server.last_error) {
    return { color: 'red', text: `错误: ${server.last_error}` };
  }
  if (server.last_connected_at) {
    const toolCount = server.cached_tools?.length ?? 0;
    return {
      color: 'green',
      text: `已连接 · ${toolCount} 个工具`,
    };
  }
  return { color: 'yellow', text: '未测试' };
}
```

## 7.7 样式参考

与现有 AgentDialog 中 SubAgent 配置的样式保持一致:
- 使用相同的卡片容器样式
- 使用相同的表单输入组件
- 使用相同的按钮样式和间距
- 保持 dark/light theme 兼容
