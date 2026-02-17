/**
 * Knowledge Base API client.
 *
 * Tree-based knowledge storage: folders, documents (rich text), datasets (tables).
 */

import { api } from './api';

// ==================== Types ====================

export type NodeType = 'folder' | 'document' | 'dataset';

export interface FieldDefinition {
  name: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'select' | 'multi_select' | 'url';
  required?: boolean;
  description?: string;
  options?: string[];
  default?: unknown;
  width?: number;
}

export interface SchemaDefinition {
  fields: FieldDefinition[];
}

export interface PreprocessingRules {
  remove_extra_whitespace?: boolean;
  remove_urls?: boolean;
}

export interface VectorizationConfig {
  model_id: string;
  chunk_size: number;
  chunk_overlap: number;
  separators: string[];
  preprocessing_rules?: PreprocessingRules;
  parent_child_mode: boolean;
  parent_chunk_size: number;
}

export interface KnowledgeNode {
  id: string;
  parent_id: string | null;
  user_id: string;
  name: string;
  node_type: NodeType;
  vector_enabled: boolean;
  vectorization_config?: VectorizationConfig | null;
  content: string | null;
  schema_definition: SchemaDefinition | null;
  description: string | null;
  icon: string | null;
  position: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface NodeTreeItem {
  id: string;
  parent_id: string | null;
  name: string;
  node_type: NodeType;
  vector_enabled: boolean;
  icon: string | null;
  position: number;
  has_content: boolean;
  schema_definition: SchemaDefinition | null;
  created_at: string;
  updated_at: string;
  children: NodeTreeItem[];
}

export interface DatasetRow {
  id: string;
  dataset_id: string;
  data: Record<string, unknown>;
  position: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface SearchHit {
  node_id: string | null;
  row_id: string | null;
  chunk_id?: string | null;
  node_name: string;
  node_type: string;
  content_preview: string;
  score: number | null;
  fuzzy_score?: number | null;
  vector_score?: number | null;
  parent_content?: string | null;
}

// ==================== Request types ====================

export interface NodeCreate {
  name: string;
  node_type: NodeType;
  parent_id?: string | null;
  description?: string;
  icon?: string;
  position?: number;
  content?: string;
  schema_definition?: SchemaDefinition;
}

export interface NodeUpdate {
  name?: string;
  description?: string;
  icon?: string;
  content?: string;
  schema_definition?: SchemaDefinition;
  vector_enabled?: boolean;
  vectorization_config?: VectorizationConfig;
}

export interface VectorizationConfigUpdate {
  model_id?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  separators?: string[];
  preprocessing_rules?: PreprocessingRules;
  parent_child_mode?: boolean;
  parent_chunk_size?: number;
}

export interface NodeMove {
  parent_id?: string | null;
  position?: number;
}

export interface RowCreate {
  data: Record<string, unknown>;
  position?: number;
}

export interface RowUpdate {
  data?: Record<string, unknown>;
  position?: number;
}

export interface RowListResponse {
  items: DatasetRow[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export type SearchMode = 'fuzzy' | 'vector' | 'hybrid';

export interface SearchRequest {
  folder_ids?: string[];
  query?: string;
  search_mode?: SearchMode;
  fuzzy_weight?: number;
  vector_weight?: number;
  top_k?: number;
  min_score?: number;
  page?: number;
  size?: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
}

export interface EmbeddingModelInfo {
  model_id: string;
  dimensions: number;
  provider: string;
}

// ==================== API ====================

export const knowledgeApi = {
  // Tree
  getTree: async (): Promise<{ items: NodeTreeItem[] }> => {
    const { data } = await api.get('/api/v1/knowledge/tree');
    return data;
  },

  // Node CRUD
  getNode: async (id: string): Promise<KnowledgeNode> => {
    const { data } = await api.get(`/api/v1/knowledge/nodes/${id}`);
    return data;
  },

  createNode: async (body: NodeCreate): Promise<KnowledgeNode> => {
    const { data } = await api.post('/api/v1/knowledge/nodes', body);
    return data;
  },

  updateNode: async (id: string, body: NodeUpdate): Promise<KnowledgeNode> => {
    const { data } = await api.patch(`/api/v1/knowledge/nodes/${id}`, body);
    return data;
  },

  deleteNode: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/knowledge/nodes/${id}`);
  },

  moveNode: async (id: string, body: NodeMove): Promise<KnowledgeNode> => {
    const { data } = await api.post(`/api/v1/knowledge/nodes/${id}/move`, body);
    return data;
  },

  setVectorization: async (id: string, enabled: boolean): Promise<KnowledgeNode> => {
    const { data } = await api.post(`/api/v1/knowledge/nodes/${id}/vectorize`, { enabled });
    return data;
  },

  updateVectorizationConfig: async (
    nodeId: string,
    config: VectorizationConfigUpdate
  ): Promise<KnowledgeNode> => {
    const { data } = await api.patch(
      `/api/v1/knowledge/nodes/${nodeId}/vectorization-config`,
      config
    );
    return data;
  },

  getEmbeddingModels: async (): Promise<{ models: EmbeddingModelInfo[] }> => {
    const { data } = await api.get('/api/v1/knowledge/embedding-models');
    return data;
  },

  // Dataset rows
  listRows: async (
    datasetId: string,
    params?: { page?: number; size?: number }
  ): Promise<RowListResponse> => {
    const { data } = await api.get(`/api/v1/knowledge/datasets/${datasetId}/rows`, { params });
    return data;
  },

  createRow: async (datasetId: string, body: RowCreate): Promise<DatasetRow> => {
    const { data } = await api.post(`/api/v1/knowledge/datasets/${datasetId}/rows`, body);
    return data;
  },

  updateRow: async (
    datasetId: string,
    rowId: string,
    body: RowUpdate
  ): Promise<DatasetRow> => {
    const { data } = await api.patch(
      `/api/v1/knowledge/datasets/${datasetId}/rows/${rowId}`,
      body
    );
    return data;
  },

  deleteRow: async (datasetId: string, rowId: string): Promise<void> => {
    await api.delete(`/api/v1/knowledge/datasets/${datasetId}/rows/${rowId}`);
  },

  batchUpdateRows: async (
    datasetId: string,
    updates: Array<{ id: string; position?: number; data?: Record<string, unknown> }>
  ): Promise<{ updated: number }> => {
    const { data } = await api.patch(
      `/api/v1/knowledge/datasets/${datasetId}/rows/batch`,
      { updates }
    );
    return data;
  },

  // Dataset columns
  addColumn: async (
    datasetId: string,
    field: FieldDefinition
  ): Promise<KnowledgeNode> => {
    const { data } = await api.post(`/api/v1/knowledge/datasets/${datasetId}/columns`, {
      field,
    });
    return data;
  },

  updateColumn: async (
    datasetId: string,
    colName: string,
    updates: Partial<FieldDefinition>
  ): Promise<KnowledgeNode> => {
    const { data } = await api.patch(
      `/api/v1/knowledge/datasets/${datasetId}/columns/${colName}`,
      updates
    );
    return data;
  },

  deleteColumn: async (datasetId: string, colName: string): Promise<KnowledgeNode> => {
    const { data } = await api.delete(
      `/api/v1/knowledge/datasets/${datasetId}/columns/${colName}`
    );
    return data;
  },

  reorderColumns: async (
    datasetId: string,
    fieldNames: string[]
  ): Promise<KnowledgeNode> => {
    const { data } = await api.patch(
      `/api/v1/knowledge/datasets/${datasetId}/columns/reorder`,
      { field_names: fieldNames }
    );
    return data;
  },

  // Search
  search: async (body: SearchRequest): Promise<SearchResponse> => {
    const { data } = await api.post('/api/v1/knowledge/search', body);
    return data;
  },
};
