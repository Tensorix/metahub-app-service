import { apiClient } from './api';

export type RelationType = 'session' | 'topic' | 'node';

export interface RelationRef {
  type: RelationType;
  id: string;
}

export interface RelationInfo {
  type: RelationType;
  id: string;
  name: string;
  session_id?: string;
  session_name?: string;
  node_type?: string;
}

export interface Activity {
  id: string;
  type: string;
  name: string;
  priority: number;
  comments?: string;
  tags?: string[];
  source_type?: string;
  source_id?: string;
  relation_ids?: string[];
  relations?: RelationInfo[];
  status: 'pending' | 'active' | 'done' | 'dismissed';
  remind_at?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface ActivityCreate {
  type: string;
  name: string;
  priority?: number;
  comments?: string;
  tags?: string[];
  source_type?: string;
  source_id?: string;
  relation_ids?: string[];
  relations?: RelationRef[];
  status?: 'pending' | 'active' | 'done' | 'dismissed';
  remind_at?: string;
  due_date?: string;
}

export interface ActivityUpdate {
  relations?: RelationRef[];
  type?: string;
  name?: string;
  priority?: number;
  comments?: string;
  tags?: string[];
  source_type?: string;
  source_id?: string;
  relation_ids?: string[];
  status?: 'pending' | 'active' | 'done' | 'dismissed';
  remind_at?: string;
  due_date?: string;
}

export interface ActivityListQuery {
  page?: number;
  size?: number;
  type?: string;
  priority_min?: number;
  priority_max?: number;
  tags?: string[];
  is_deleted?: boolean;
}

export interface ActivityListResponse {
  items: Activity[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const activityApi = {
  // 创建活动
  createActivity: async (data: ActivityCreate): Promise<Activity> => {
    const response = await apiClient.post('/api/v1/activities', data);
    return response.data;
  },

  // 获取活动详情
  getActivity: async (id: string): Promise<Activity> => {
    const response = await apiClient.get(`/api/v1/activities/${id}`);
    return response.data;
  },

  // 获取活动列表
  getActivities: async (query?: ActivityListQuery): Promise<ActivityListResponse> => {
    const response = await apiClient.get('/api/v1/activities', { params: query });
    return response.data;
  },

  // 更新活动
  updateActivity: async (id: string, data: ActivityUpdate): Promise<Activity> => {
    const response = await apiClient.put(`/api/v1/activities/${id}`, data);
    return response.data;
  },

  // 删除活动
  deleteActivity: async (id: string, hardDelete = false): Promise<void> => {
    await apiClient.delete(`/api/v1/activities/${id}`, { params: { hard_delete: hardDelete } });
  },

  // 恢复活动
  restoreActivity: async (id: string): Promise<Activity> => {
    const response = await apiClient.post(`/api/v1/activities/${id}/restore`);
    return response.data;
  },
};
