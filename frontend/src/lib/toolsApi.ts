/**
 * Tools API - Fetch available agent tools from backend.
 */

import { api } from './api';

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  function: string;
}

export interface ToolListResponse {
  tools: ToolInfo[];
  total: number;
}

export interface ToolCategoryInfo {
  category: string;
  tools: ToolInfo[];
}

export interface ToolCategorizedResponse {
  categories: ToolCategoryInfo[];
  total: number;
}

/**
 * 获取所有可用工具列表
 */
export async function listTools(category?: string): Promise<ToolListResponse> {
  const params = category ? { category } : undefined;
  const response = await api.get<ToolListResponse>('/api/v1/tools', { params });
  return response.data;
}

/**
 * 获取按分类组织的工具列表
 */
export async function listToolsByCategory(): Promise<ToolCategorizedResponse> {
  const response = await api.get<ToolCategorizedResponse>('/api/v1/tools/categories');
  return response.data;
}

/**
 * 获取单个工具详情
 */
export async function getToolInfo(toolName: string): Promise<ToolInfo> {
  const response = await api.get<ToolInfo>(`/api/v1/tools/${encodeURIComponent(toolName)}`);
  return response.data;
}
