/**
 * Embedding Management API Client
 */

import { apiClient } from "./api";

export interface EmbeddingModel {
  model_id: string;
  provider: string;
  model_name: string;
  dimensions: number;
  index_slug: string;
}

export interface EmbeddingStatus {
  category: string;
  active_model: string;
  model_dimensions: number;
  model_provider: string;
  total_indices: number;
  completed_embeddings: number;
  coverage: string;
}

export interface SwitchModelRequest {
  category: string;
  model_id: string;
}

export interface SwitchModelResponse {
  status: string;
  category: string;
  model_id: string;
  note?: string;
}

/**
 * Get embedding status for a category
 */
export async function getEmbeddingStatus(
  category: string = "message"
): Promise<EmbeddingStatus> {
  const response = await apiClient.get(
    `/api/v1/admin/embedding/status?category=${category}`
  );
  return response.data;
}

/**
 * List all registered embedding models
 */
export async function listEmbeddingModels(): Promise<{
  models: EmbeddingModel[];
}> {
  const response = await apiClient.get("/api/v1/admin/embedding/models");
  return response.data;
}

/**
 * Switch active embedding model for a category
 */
export async function switchEmbeddingModel(
  request: SwitchModelRequest
): Promise<SwitchModelResponse> {
  const response = await apiClient.post("/api/v1/admin/embedding/switch", request);
  return response.data;
}
