/**
 * Agent Management API
 */

import { api } from './api';

/**
 * SubAgent - 子代理配置
 */
export interface SubAgent {
  id?: string;
  name: string;
  description: string;
  system_prompt?: string;
  model?: string;
  tools?: string[];
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
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  subagents?: SubAgent[];
  summarization?: SummarizationConfig;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * AgentCreate - 创建 Agent 请求
 */
export interface AgentCreate {
  name: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  subagents?: SubAgent[];
  summarization?: SummarizationConfig;
  metadata?: Record<string, any>;
}

/**
 * AgentUpdate - 更新 Agent 请求
 */
export interface AgentUpdate {
  name?: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: SkillContent[];
  memory_files?: MemoryContent[];
  subagents?: SubAgent[];
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
};
