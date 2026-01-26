/**
 * Agent Management API
 */

import { api } from './api';

export interface Agent {
  id: string;
  name: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: string[];
  memory_files?: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface AgentCreate {
  name: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: string[];
  memory_files?: string[];
  metadata?: Record<string, any>;
}

export interface AgentUpdate {
  name?: string;
  system_prompt?: string;
  model?: string;
  model_provider?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: string[];
  skills?: string[];
  memory_files?: string[];
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
