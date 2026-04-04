/**
 * System Config API Client
 */

import { apiClient } from "./api";

// --- Types ---

export interface ProviderConfig {
  name: string;
  api_base_url: string;
  api_key?: string | null;
  provider_type?: string;
}

export type ProvidersMap = Record<string, ProviderConfig>;

export interface MessageAnalyzerConfig {
  provider: string;
  model_name: string;
}

export interface EmbeddingConfig {
  provider: string;
  model_name: string;
  dimensions: number;
  max_tokens: number;
  batch_size: number;
}

export interface AgentDefaultConfig {
  provider: string;
  model_name: string;
}

export interface SandboxConfig {
  enabled: boolean;
  api_domain: string;
  api_key: string;
  default_image: string;
  default_timeout: number;
  max_per_user: number;
}

export interface UpstreamModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface SystemConfigResponse<T = Record<string, any>> {
  key: string;
  value: T;
  description?: string;
  updated_at: string;
}

// --- API Functions ---

export async function getSystemConfig<T = Record<string, any>>(
  key: string
): Promise<SystemConfigResponse<T>> {
  const response = await apiClient.get(`/api/v1/system-config/${key}`);
  return response.data;
}

export async function updateSystemConfig(
  key: string,
  value: Record<string, any>,
  description?: string
): Promise<SystemConfigResponse> {
  const response = await apiClient.put(`/api/v1/system-config/${key}`, {
    value,
    ...(description !== undefined && { description }),
  });
  return response.data;
}

export async function fetchUpstreamModels(opts: {
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<UpstreamModel[]> {
  const response = await apiClient.post("/api/v1/system-config/proxy/models", {
    ...(opts.providerId && { provider_id: opts.providerId }),
    ...(opts.baseUrl && { base_url: opts.baseUrl }),
    ...(opts.apiKey && { api_key: opts.apiKey }),
  });
  return response.data.models;
}
