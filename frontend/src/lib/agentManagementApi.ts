/**
 * Agent Management API
 */

import { api } from './api';
import type { McpServerResponse } from '../types/mcpServer';

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

/**
 * SkillContent - 技能内容
 */
export interface SkillContent {
  name: string;
  content: string;
}

/**
 * MemoryContent - 记忆内容
 */
export interface MemoryContent {
  name: string;
  content: string;
}

/**
 * SummarizationConfig - 对话摘要配置
 */
export interface SummarizationConfig {
  enabled: boolean;
  max_messages?: number;
  keep_last_n?: number;
  summary_prompt?: string;
  model?: string;
}

/**
 * Agent - AI Agent 完整配置
 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  /** 工具需人工批准配置 {tool_name: true | {allowed_decisions}} */
  interrupt_on?: Record<string, boolean | { allowed_decisions?: string[] }>;
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  subagents?: MountedSubagentSummary[];
  mcp_servers?: McpServerResponse[];
  summarization?: SummarizationConfig;
  metadata?: Record<string, any>;
  parent_agents_count?: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * AgentCreate - 创建 Agent 请求
 */
export interface AgentCreate {
  name: string;
  description?: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  /** 工具需人工批准配置 {tool_name: true | {allowed_decisions}} */
  interrupt_on?: Record<string, boolean | { allowed_decisions?: string[] }>;
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  mount_subagents?: MountSubagentRequest[];
  summarization?: SummarizationConfig;
  metadata?: Record<string, any>;
}

/**
 * AgentUpdate - 更新 Agent 请求
 */
export interface AgentUpdate {
  name?: string;
  description?: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  /** 工具需人工批准配置 {tool_name: true | {allowed_decisions}} */
  interrupt_on?: Record<string, boolean | { allowed_decisions?: string[] }>;
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  summarization?: SummarizationConfig;
  metadata?: Record<string, any>;
}

export interface AgentListResponse {
  items: Agent[];
  total: number;
  page: number;
  page_size: number;
}

export const agentManagementApi = {
  /**
   * Create a new agent
   */
  async createAgent(data: AgentCreate): Promise<Agent> {
    const response = await api.post<Agent>('/api/v1/agents', data);
    return response.data;
  },

  /**
   * Get agent list
   */
  async listAgents(params?: {
    page?: number;
    page_size?: number;
    search?: string;
  }): Promise<AgentListResponse> {
    const response = await api.get<AgentListResponse>('/api/v1/agents', { params });
    return response.data;
  },

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<Agent> {
    const response = await api.get<Agent>(`/api/v1/agents/${agentId}`);
    return response.data;
  },

  /**
   * Update agent
   */
  async updateAgent(agentId: string, data: AgentUpdate): Promise<Agent> {
    const response = await api.put<Agent>(`/api/v1/agents/${agentId}`, data);
    return response.data;
  },

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    await api.delete(`/api/v1/agents/${agentId}`);
  },

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
