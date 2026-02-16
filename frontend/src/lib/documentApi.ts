/**
 * Document Store API client.
 *
 * Provides CRUD for collections and documents,
 * plus hybrid search (vector + structured filter).
 */

import { api } from './api';

// Types
export interface FieldDefinition {
  name: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'select' | 'multi_select' | 'url';
  required?: boolean;
  description?: string;
  options?: string[];
  default?: unknown;
}

export interface SchemaDefinition {
  fields: FieldDefinition[];
}

export interface DocumentCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  type: 'structured' | 'unstructured';
  schema_definition: Record<string, unknown> | null;
  vector_enabled: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface CollectionCreate {
  name: string;
  description?: string;
  type: 'structured' | 'unstructured';
  schema_definition?: SchemaDefinition;
}

export interface CollectionUpdate {
  name?: string;
  description?: string;
  schema_definition?: SchemaDefinition;
}

export interface Document {
  id: string;
  collection_id: string;
  title: string;
  content: string | null;
  data: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface DocumentCreate {
  title: string;
  content?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface DocumentUpdate {
  title?: string;
  content?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface DocumentListResponse {
  items: Document[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface DocumentSearchHit {
  document: Document;
  score?: number;
}

export interface DocumentSearchResponse {
  hits: DocumentSearchHit[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface DocumentSearchRequest {
  collection_ids?: string[];
  query?: string;
  filters?: FilterCondition[];
  top_k?: number;
  min_score?: number;
  page?: number;
  size?: number;
}

export interface FilterCondition {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'starts_with';
  value: unknown;
}

// API
export const documentApi = {
  // Collections
  listCollections: async (): Promise<{ items: DocumentCollection[]; total: number }> => {
    const { data } = await api.get('/api/v1/documents/collections');
    return data;
  },

  getCollection: async (id: string): Promise<DocumentCollection> => {
    const { data } = await api.get(`/api/v1/documents/collections/${id}`);
    return data;
  },

  createCollection: async (body: CollectionCreate): Promise<DocumentCollection> => {
    const { data } = await api.post('/api/v1/documents/collections', body);
    return data;
  },

  updateCollection: async (id: string, body: CollectionUpdate): Promise<DocumentCollection> => {
    const { data } = await api.put(`/api/v1/documents/collections/${id}`, body);
    return data;
  },

  deleteCollection: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/documents/collections/${id}`);
  },

  setVectorization: async (id: string, enabled: boolean): Promise<DocumentCollection> => {
    const { data } = await api.post(`/api/v1/documents/collections/${id}/vectorize`, { enabled });
    return data;
  },

  // Documents
  listDocuments: async (
    collectionId: string,
    params?: { page?: number; size?: number; include_deleted?: boolean }
  ): Promise<DocumentListResponse> => {
    const { data } = await api.get(`/api/v1/documents/collections/${collectionId}/docs`, {
      params,
    });
    return data;
  },

  getDocument: async (id: string): Promise<Document> => {
    const { data } = await api.get(`/api/v1/documents/docs/${id}`);
    return data;
  },

  createDocument: async (collectionId: string, body: DocumentCreate): Promise<Document> => {
    const { data } = await api.post(`/api/v1/documents/collections/${collectionId}/docs`, body);
    return data;
  },

  updateDocument: async (id: string, body: DocumentUpdate): Promise<Document> => {
    const { data } = await api.put(`/api/v1/documents/docs/${id}`, body);
    return data;
  },

  deleteDocument: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/documents/docs/${id}`);
  },

  // Search
  search: async (body: DocumentSearchRequest): Promise<DocumentSearchResponse> => {
    const { data } = await api.post('/api/v1/documents/search', body);
    return data;
  },
};
