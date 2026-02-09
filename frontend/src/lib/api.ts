import axios from 'axios';
import { getApiBaseUrl } from '@/config/env';

const API_BASE_URL = getApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Export as apiClient for compatibility
export const apiClient = api;

// 请求拦截器：添加 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理 token 过期
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });

          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }

      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// SHA256 哈希函数
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// API 类型定义
export interface RegisterData {
  username: string;
  password: string;
  email?: string;
  phone?: string;
}

export interface LoginData {
  username: string;
  password: string;
  client_type?: string;
  device_info?: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  is_superuser: boolean;
  api_key?: string;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// Auth API
export const authApi = {
  async register(data: RegisterData): Promise<User> {
    const hashedPassword = await sha256(data.password);
    const response = await api.post('/api/v1/auth/register', {
      ...data,
      password: hashedPassword,
    });
    return response.data;
  },

  async login(data: LoginData): Promise<TokenResponse> {
    const hashedPassword = await sha256(data.password);
    const response = await api.post('/api/v1/auth/login', {
      ...data,
      password: hashedPassword,
      client_type: data.client_type || 'web',
    });
    return response.data;
  },

  async logout(refreshToken?: string): Promise<void> {
    await api.post('/api/v1/auth/logout', {
      refresh_token: refreshToken,
    });
  },

  async getMe(): Promise<User> {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const response = await api.post('/api/v1/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },
};

// API Key API
export interface ApiKeyResponse {
  api_key: string;
}

export interface ApiKeyResetResponse {
  api_key: string;
  message: string;
}

export const apiKeyApi = {
  async generate(): Promise<ApiKeyResponse> {
    const response = await api.post('/api/v1/api-key/generate');
    return response.data;
  },

  async reset(): Promise<ApiKeyResetResponse> {
    const response = await api.post('/api/v1/api-key/reset');
    return response.data;
  },

  async get(): Promise<ApiKeyResponse> {
    const response = await api.get('/api/v1/api-key');
    return response.data;
  },
};

// Session API
export interface Session {
  id: string;
  name?: string;
  type: string;
  agent_id?: string;
  metadata?: Record<string, any>;
  source?: string;
  auto_reply_enabled: boolean;
  last_visited_at?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  unread_count: number;
}

export interface SessionCreate {
  name?: string;
  type: string;
  agent_id?: string;
  metadata?: Record<string, any>;
  source?: string;
  auto_reply_enabled?: boolean;
}

export interface SessionUpdate {
  name?: string;
  type?: string;
  agent_id?: string;
  metadata?: Record<string, any>;
  source?: string;
  last_visited_at?: string;
  auto_reply_enabled?: boolean;
}

export interface SessionListResponse {
  items: Session[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface Topic {
  id: string;
  name?: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface TopicCreate {
  name?: string;
  session_id: string;
}

export interface TopicUpdate {
  name?: string;
}

// ========== MessagePart 类型扩展 ==========

export type MessagePartType =
  | 'text'
  | 'image'
  | 'at'
  | 'url'
  | 'json'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'thinking'
  | 'subagent_call';

export interface MessagePart {
  id: string;
  message_id: string;
  type: MessagePartType;
  content: string;
  metadata?: Record<string, any>;
  event_id?: string;
  raw_data?: Record<string, any>;
  created_at: string;
}

// ========== AI Part 内容解析类型 ==========

export interface ToolCallContent {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultContent {
  call_id: string;
  name: string;
  result: string;
  success: boolean;
}

export interface SubAgentCallContent {
  call_id: string;
  name: string;
  description: string;
  result: string;
  duration_ms: number;
}

export interface ErrorContent {
  error: string;
  code?: string;
  recoverable?: boolean;
}

export interface ThinkingContent {
  content: string;
  timestamp?: string;
}

// ========== 类型守卫函数 ==========

export function isToolCallPart(part: MessagePart): boolean {
  return part.type === 'tool_call';
}

export function isToolResultPart(part: MessagePart): boolean {
  return part.type === 'tool_result';
}

export function isErrorPart(part: MessagePart): boolean {
  return part.type === 'error';
}

export function isThinkingPart(part: MessagePart): boolean {
  return part.type === 'thinking';
}

export function isTextPart(part: MessagePart): boolean {
  return part.type === 'text';
}

// ========== Part 内容解析函数 ==========

export function parseToolCallContent(part: MessagePart): ToolCallContent | null {
  if (part.type !== 'tool_call') return null;
  try {
    return JSON.parse(part.content) as ToolCallContent;
  } catch {
    return null;
  }
}

export function parseToolResultContent(part: MessagePart): ToolResultContent | null {
  if (part.type !== 'tool_result') return null;
  try {
    return JSON.parse(part.content) as ToolResultContent;
  } catch {
    return null;
  }
}

export function parseErrorContent(part: MessagePart): ErrorContent | null {
  if (part.type !== 'error') return null;
  try {
    return JSON.parse(part.content) as ErrorContent;
  } catch {
    return null;
  }
}

export interface MessageSender {
  id: string;
  name: string;
  external_id?: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  topic_id?: string;
  role: string;
  sender_id?: string;
  sender?: MessageSender;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  parts: MessagePart[];
}

export interface MessageCreate {
  session_id: string;
  topic_id?: string;
  role: string;
  sender_id?: string;
  parts: {
    type: string;
    content: string;
    metadata?: Record<string, any>;
    event_id?: string;
    raw_data?: Record<string, any>;
  }[];
}

export interface MessageListResponse {
  items: Message[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const sessionApi = {
  async getSessions(params?: {
    page?: number;
    size?: number;
    type?: string;
    source?: string;
    is_deleted?: boolean;
  }): Promise<SessionListResponse> {
    const response = await api.get('/api/v1/sessions', { params });
    return response.data;
  },

  async getSession(sessionId: string): Promise<Session> {
    const response = await api.get(`/api/v1/sessions/${sessionId}`);
    return response.data;
  },

  async createSession(data: SessionCreate): Promise<Session> {
    const response = await api.post('/api/v1/sessions', data);
    return response.data;
  },

  async updateSession(sessionId: string, data: SessionUpdate): Promise<Session> {
    const response = await api.put(`/api/v1/sessions/${sessionId}`, data);
    return response.data;
  },

  async deleteSession(sessionId: string, hardDelete = false): Promise<void> {
    await api.delete(`/api/v1/sessions/${sessionId}`, {
      params: { hard_delete: hardDelete },
    });
  },

  async markSessionRead(sessionId: string): Promise<Session> {
    const response = await api.post(`/api/v1/sessions/${sessionId}/read`);
    return response.data;
  },

  async getTopics(sessionId: string): Promise<Topic[]> {
    const response = await api.get(`/api/v1/sessions/${sessionId}/topics`);
    return response.data;
  },

  async createTopic(sessionId: string, data: TopicCreate): Promise<Topic> {
    const response = await api.post(`/api/v1/sessions/${sessionId}/topics`, data);
    return response.data;
  },

  async updateTopic(topicId: string, data: TopicUpdate): Promise<Topic> {
    const response = await api.put(`/api/v1/topics/${topicId}`, data);
    return response.data;
  },

  async deleteTopic(topicId: string, hardDelete = false): Promise<void> {
    await api.delete(`/api/v1/topics/${topicId}`, {
      params: { hard_delete: hardDelete },
    });
  },

  async getMessages(sessionId: string, params?: {
    page?: number;
    size?: number;
    topic_id?: string;
    role?: string;
    is_deleted?: boolean;
  }): Promise<MessageListResponse> {
    const response = await api.get(`/api/v1/sessions/${sessionId}/messages`, { params });
    return response.data;
  },

  async createMessage(sessionId: string, data: MessageCreate): Promise<Message> {
    const response = await api.post(`/api/v1/sessions/${sessionId}/messages`, data);
    return response.data;
  },

  async deleteMessage(messageId: string, hardDelete = false): Promise<void> {
    await api.delete(`/api/v1/messages/${messageId}`, {
      params: { hard_delete: hardDelete },
    });
  },

  // IM Gateway - 发送消息到 IM 平台
  async sendIMMessage(sessionId: string, data: {
    message: Array<{ type: string; text?: string; content?: string; [key: string]: any }>;
    message_str: string;
  }): Promise<{
    success: boolean;
    message_id?: string;
    bridge_result?: any;
    error?: string;
  }> {
    const response = await api.post(`/api/v1/sessions/${sessionId}/messages/send`, data);
    return response.data;
  },
};


// ============ Session Transfer Types ============

export interface ResourceRef {
  type: string;
  url: string;
  cached: boolean;
  cache_path?: string;
}

export interface ExportStatistics {
  total_messages: number;
  total_topics: number;
  total_senders: number;
  date_range: {
    earliest?: string;
    latest?: string;
  };
  filter_applied?: {
    start_date?: string;
    end_date?: string;
  };
}

export interface ImportStatistics {
  imported_messages: number;
  imported_topics: number;
  imported_senders: number;
  merged_senders: number;
  skipped_messages: number;
}

export interface ImportedSessionInfo {
  session_id: string;
  original_id: string;
  name?: string;
  type: string;
  statistics: ImportStatistics;
}

export interface SessionImportResponse {
  success: boolean;
  imported_sessions: ImportedSessionInfo[];
  total_statistics: ImportStatistics;
}

export interface DuplicateCheck {
  has_duplicates: boolean;
  duplicate_export_ids: string[];
  affected_sessions: string[];
}

export interface SessionPreview {
  original_id: string;
  name?: string;
  type: string;
  message_count: number;
  topic_count: number;
}

export interface ImportPreviewResponse {
  valid: boolean;
  format: string;
  version: string;
  export_id?: string;
  sessions: SessionPreview[];
  total_statistics?: ExportStatistics;
  duplicate_check?: DuplicateCheck;
  warnings: string[];
  errors: string[];
}

export interface ExportOptions {
  format?: 'json' | 'jsonl';
  includeDeleted?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface BatchExportOptions extends ExportOptions {
  sessionIds?: string[];
  typeFilter?: string[];
  groupByType?: boolean;
}

export interface ImportOptions {
  format?: string;
  mergeSenders?: boolean;
  /** 是否跳过 embedding 生成（只创建文本索引，节省成本） */
  skipEmbedding?: boolean;
  /** 是否自动创建搜索索引（后台任务），默认 true */
  autoIndex?: boolean;
}

// ============ Session Transfer API ============

export const sessionTransferApi = {
  /**
   * 导出单个会话数据
   * @param sessionId 会话 ID
   * @param options 导出选项
   * @returns Blob 数据和文件名
   */
  async exportSession(
    sessionId: string,
    options: ExportOptions = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams();
    if (options.format) params.append('format', options.format);
    if (options.includeDeleted) params.append('include_deleted', 'true');
    if (options.startDate) params.append('start_date', options.startDate);
    if (options.endDate) params.append('end_date', options.endDate);
    
    const response = await api.get(
      `/api/v1/sessions/${sessionId}/export?${params.toString()}`,
      { responseType: 'blob' }
    );
    
    // 从 Content-Disposition 获取文件名
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'session_export.json';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }
    
    return { blob: response.data, filename };
  },

  /**
   * 批量导出会话数据
   * @param options 批量导出选项
   * @returns Blob 数据和文件名
   */
  async exportSessionsBatch(
    options: BatchExportOptions = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await api.post(
      '/api/v1/sessions/export/batch',
      {
        session_ids: options.sessionIds,
        type_filter: options.typeFilter,
        format: options.format || 'jsonl',
        include_deleted: options.includeDeleted || false,
        start_date: options.startDate,
        end_date: options.endDate,
        group_by_type: options.groupByType ?? true,
      },
      { responseType: 'blob' }
    );
    
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'sessions_export.zip';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }
    
    return { blob: response.data, filename };
  },

  /**
   * 导入会话数据
   * @param file 导出文件
   * @param options 导入选项
   */
  async importSessions(
    file: File,
    options: ImportOptions = {}
  ): Promise<SessionImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const params = new URLSearchParams();
    if (options.format) params.append('format', options.format);
    if (options.mergeSenders !== undefined) {
      params.append('merge_senders', String(options.mergeSenders));
    }
    if (options.skipEmbedding !== undefined) {
      params.append('skip_embedding', String(options.skipEmbedding));
    }
    if (options.autoIndex !== undefined) {
      params.append('auto_index', String(options.autoIndex));
    }
    
    const response = await api.post(
      `/api/v1/sessions/import?${params.toString()}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    
    return response.data;
  },

  /**
   * 预览导入文件
   * @param file 导出文件
   */
  async previewImport(file: File): Promise<ImportPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/api/v1/sessions/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    return response.data;
  },
};


// ============ Search Index Types ============

export interface SearchIndexStats {
  total_indexed: number;
  embedding_completed: number;
  embedding_pending: number;
  embedding_failed: number;
  no_embedding: number;
}

export interface SessionSearchIndexStats {
  session_id: string;
  total_messages: number;
  indexed_messages: number;
  embedding_completed: number;
  no_embedding: number;
  index_coverage: number;
}

export interface ReindexRequest {
  skip_embedding?: boolean;
  regenerate_embeddings?: boolean;
}

export interface ReindexResponse {
  status: string;
  total_messages: number;
  indexed_count: number;
  skipped_count: number;
  failed_count: number;
  error?: string;
}

export interface BackfillEmbeddingsRequest {
  batch_size?: number;
}

export interface BackfillEmbeddingsResponse {
  status: string;
  total_missing: number;
  processed: number;
  succeeded: number;
  failed: number;
  error?: string;
}

// ============ Search Index API ============

export const searchIndexApi = {
  /**
   * 获取用户搜索索引统计
   */
  async getUserStats(): Promise<SearchIndexStats> {
    const response = await api.get('/api/v1/search-index/stats');
    return response.data;
  },

  /**
   * 获取会话搜索索引统计
   * @param sessionId 会话 ID
   * @param signal 可选的 AbortSignal 用于取消请求
   */
  async getSessionStats(sessionId: string, signal?: AbortSignal): Promise<SessionSearchIndexStats> {
    const response = await api.get(`/api/v1/sessions/${sessionId}/search-index/stats`, { signal });
    return response.data;
  },

  /**
   * 重建会话搜索索引
   * @param sessionId 会话 ID
   * @param options 重建选项
   */
  async reindexSession(
    sessionId: string,
    options: ReindexRequest = {}
  ): Promise<ReindexResponse> {
    const response = await api.post(
      `/api/v1/sessions/${sessionId}/search-index/reindex`,
      options
    );
    return response.data;
  },

  /**
   * 重建用户所有搜索索引
   * @param options 重建选项
   */
  async reindexAll(options: ReindexRequest = {}): Promise<ReindexResponse> {
    const response = await api.post('/api/v1/search-index/reindex', options);
    return response.data;
  },

  /**
   * 补建会话 embedding
   * @param sessionId 会话 ID
   * @param options 补建选项
   */
  async backfillSessionEmbeddings(
    sessionId: string,
    options: BackfillEmbeddingsRequest = {}
  ): Promise<BackfillEmbeddingsResponse> {
    const response = await api.post(
      `/api/v1/sessions/${sessionId}/search-index/backfill-embeddings`,
      options
    );
    return response.data;
  },

  /**
   * 补建用户所有 embedding
   * @param options 补建选项
   */
  async backfillAllEmbeddings(
    options: BackfillEmbeddingsRequest = {}
  ): Promise<BackfillEmbeddingsResponse> {
    const response = await api.post('/api/v1/search-index/backfill-embeddings', options);
    return response.data;
  },
};
// ============ Background Task API Types ============

export interface BackgroundTask {
  id: string;
  task_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  session_id?: string;
  total_items: number;
  processed_items: number;
  failed_items: number;
  progress_percent: number;
  result?: string;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface BackgroundTaskListResponse {
  tasks: BackgroundTask[];
  total: number;
}

export interface TaskStartedResponse {
  task_id: string;
  task_type: string;
  status: string;
  message: string;
}

// ============ Background Task API ============

export const backgroundTaskApi = {
  /**
   * 获取后台任务列表
   */
  async listTasks(params?: {
    status?: string;
    task_type?: string;
    limit?: number;
  }): Promise<BackgroundTaskListResponse> {
    const response = await api.get('/api/v1/background-tasks', { params });
    return response.data;
  },

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<BackgroundTask> {
    const response = await api.get(`/api/v1/background-tasks/${taskId}`);
    return response.data;
  },

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/api/v1/background-tasks/${taskId}/cancel`);
    return response.data;
  },

  /**
   * 创建索引任务
   */
  async startIndexTask(
    sessionId: string,
    skipEmbedding: boolean = false
  ): Promise<TaskStartedResponse> {
    const response = await api.post('/api/v1/background-tasks/index-session', {
      session_id: sessionId,
      skip_embedding: skipEmbedding,
    });
    return response.data;
  },

  /**
   * 创建 embedding 补建任务
   */
  async startBackfillTask(
    sessionId?: string,
    batchSize: number = 100
  ): Promise<TaskStartedResponse> {
    const response = await api.post('/api/v1/background-tasks/backfill-embeddings', {
      session_id: sessionId,
      batch_size: batchSize,
    });
    return response.data;
  },

  /**
   * 创建重建索引任务
   */
  async startReindexTask(
    sessionId: string,
    skipEmbedding: boolean = false
  ): Promise<TaskStartedResponse> {
    const response = await api.post('/api/v1/background-tasks/reindex-session', {
      session_id: sessionId,
      skip_embedding: skipEmbedding,
    });
    return response.data;
  },

  /**
   * 获取会话的后台任务
   * @param signal 可选的 AbortSignal 用于取消请求
   */
  async getSessionTasks(
    sessionId: string,
    status?: string,
    signal?: AbortSignal
  ): Promise<BackgroundTaskListResponse> {
    const response = await api.get(`/api/v1/background-tasks/session/${sessionId}`, {
      params: { status },
      signal,
    });
    return response.data;
  },
};