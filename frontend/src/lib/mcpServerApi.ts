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

const BASE_PATH = '/api/v1/agents';

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
