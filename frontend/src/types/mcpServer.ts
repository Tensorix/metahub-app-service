/**
 * MCP Server 管理相关类型定义
 */

/** MCP Server 基础配置 */
export interface McpServerConfig {
  name: string;
  description?: string;
  transport: 'http' | 'sse' | 'stdio';
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
  transport?: 'http' | 'sse' | 'stdio';
  url: string;
  headers?: Record<string, string>;
  is_enabled?: boolean;
  sort_order?: number;
}

/** 更新 MCP Server 请求 */
export interface McpServerUpdateRequest {
  name?: string;
  description?: string;
  transport?: 'http' | 'sse' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  is_enabled?: boolean;
  sort_order?: number;
}

/** 测试连接请求 */
export interface McpServerTestRequest {
  url?: string;
  transport?: 'http' | 'sse' | 'stdio';
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
