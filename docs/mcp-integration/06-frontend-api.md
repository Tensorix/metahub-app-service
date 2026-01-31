# Step 6: 前端 API 客户端

## 6.1 设计思路

参照现有 `agentManagementApi.ts` 的模式，创建独立的 MCP Server API 客户端。

## 6.2 类型定义

### frontend/src/types/mcpServer.ts

```typescript
/**
 * MCP Server 管理相关类型定义
 */

/** MCP Server 基础配置 */
export interface McpServerConfig {
  name: string;
  description?: string;
  url: string;
  headers?: Record<string, string>;
  is_enabled: boolean;
  sort_order: number;
}

/** MCP Server 完整响应 */
export interface McpServerResponse extends McpServerConfig {
  id: string;
  agent_id: string;
  last_connected_at?: string;
  last_error?: string;
  cached_tools?: McpToolInfo[];
  created_at: string;
  updated_at: string;
}

/** MCP 工具信息 */
export interface McpToolInfo {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

/** 创建 MCP Server 请求 */
export interface McpServerCreateRequest {
  name: string;
  description?: string;
  url: string;
  headers?: Record<string, string>;
  is_enabled?: boolean;
  sort_order?: number;
}

/** 更新 MCP Server 请求 */
export interface McpServerUpdateRequest {
  name?: string;
  description?: string;
  url?: string;
  headers?: Record<string, string>;
  is_enabled?: boolean;
  sort_order?: number;
}

/** 测试连接请求 */
export interface McpServerTestRequest {
  url?: string;
  headers?: Record<string, string>;
  server_id?: string;
}

/** 测试连接结果 */
export interface McpServerTestResult {
  success: boolean;
  message: string;
  tools?: McpToolInfo[];
  latency_ms?: number;
}
```

## 6.3 API 客户端

### frontend/src/lib/mcpServerApi.ts

```typescript
/**
 * MCP Server 管理 API 客户端
 *
 * 提供对 Agent MCP Server 配置的 CRUD 操作和连接测试。
 */

import { api } from './api';
import type {
  McpServerResponse,
  McpServerCreateRequest,
  McpServerUpdateRequest,
  McpServerTestRequest,
  McpServerTestResult,
} from '../types/mcpServer';

const BASE_PATH = '/agents';

/**
 * 列出 Agent 的所有 MCP Server 配置
 */
export async function listMcpServers(
  agentId: string
): Promise<McpServerResponse[]> {
  const response = await api.get<McpServerResponse[]>(
    `${BASE_PATH}/${agentId}/mcp-servers`
  );
  return response.data;
}

/**
 * 获取单个 MCP Server 详情
 */
export async function getMcpServer(
  agentId: string,
  serverId: string
): Promise<McpServerResponse> {
  const response = await api.get<McpServerResponse>(
    `${BASE_PATH}/${agentId}/mcp-servers/${serverId}`
  );
  return response.data;
}

/**
 * 添加 MCP Server 配置
 */
export async function createMcpServer(
  agentId: string,
  data: McpServerCreateRequest
): Promise<McpServerResponse> {
  const response = await api.post<McpServerResponse>(
    `${BASE_PATH}/${agentId}/mcp-servers`,
    data
  );
  return response.data;
}

/**
 * 更新 MCP Server 配置
 */
export async function updateMcpServer(
  agentId: string,
  serverId: string,
  data: McpServerUpdateRequest
): Promise<McpServerResponse> {
  const response = await api.put<McpServerResponse>(
    `${BASE_PATH}/${agentId}/mcp-servers/${serverId}`,
    data
  );
  return response.data;
}

/**
 * 删除 MCP Server 配置
 */
export async function deleteMcpServer(
  agentId: string,
  serverId: string
): Promise<void> {
  await api.delete(`${BASE_PATH}/${agentId}/mcp-servers/${serverId}`);
}

/**
 * 测试 MCP Server 连接
 *
 * 可以传入 url + headers 测试新的连接，
 * 也可以传入 server_id 测试已保存的配置。
 */
export async function testMcpServer(
  agentId: string,
  data: McpServerTestRequest
): Promise<McpServerTestResult> {
  const response = await api.post<McpServerTestResult>(
    `${BASE_PATH}/${agentId}/mcp-servers/test`,
    data
  );
  return response.data;
}
```

## 6.4 与现有 API 集成

### agentManagementApi.ts 中的 Agent 类型扩展

Agent 响应中会自动包含 `mcp_servers` 字段（通过后端 relationship），
需要在 Agent 类型中添加:

```typescript
// 在现有 Agent 类型中补充:
export interface AgentResponse {
  // ... 现有字段 ...
  mcp_servers: McpServerResponse[];
}
```

这样在编辑 Agent 时，MCP Server 列表会随 Agent 数据一起加载，
不需要额外请求。单独的 CRUD API 用于 MCP 标签页内的增删改操作。
