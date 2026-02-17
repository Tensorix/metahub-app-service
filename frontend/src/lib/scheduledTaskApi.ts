/**
 * Scheduled Task API
 */

import { api } from './api';

// ============================================================
// 类型定义
// ============================================================

export interface ScheduledTask {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  schedule_type: 'cron' | 'interval' | 'one_shot';
  schedule_config: Record<string, unknown>;
  timezone: string;
  task_type: string;
  task_params: Record<string, unknown>;
  status: 'active' | 'paused' | 'completed' | 'expired';
  last_run_at: string | null;
  last_run_status: 'success' | 'failed' | null;
  last_run_error: string | null;
  next_run_at: string | null;
  run_count: number;
  max_runs: number | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledTaskCreate {
  name: string;
  description?: string | null;
  schedule_type: 'cron' | 'interval' | 'one_shot';
  schedule_config: Record<string, unknown>;
  timezone?: string;
  task_type: string;
  task_params?: Record<string, unknown>;
  max_runs?: number | null;
}

export interface ScheduledTaskUpdate {
  name?: string;
  description?: string | null;
  schedule_type?: 'cron' | 'interval' | 'one_shot';
  schedule_config?: Record<string, unknown>;
  timezone?: string;
  task_type?: string;
  task_params?: Record<string, unknown>;
  max_runs?: number | null;
}

export interface ScheduledTaskListResponse {
  tasks: ScheduledTask[];
  total: number;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将 schedule_config 转换为人类可读的中文描述
 */
export function describeSchedule(
  scheduleType: string,
  scheduleConfig: Record<string, unknown>
): string {
  if (scheduleType === 'cron') {
    const hour = scheduleConfig.hour as number | undefined;
    const minute = scheduleConfig.minute as number | undefined;
    const dayOfWeek = scheduleConfig.day_of_week as string | number | undefined;
    const day = scheduleConfig.day as number | string | undefined;
    const month = scheduleConfig.month as number | string | undefined;

    const parts: string[] = [];
    if (month !== undefined && month !== '*' && typeof month === 'number') parts.push(`${month}月`);
    if (day !== undefined && day !== '*' && typeof day === 'number') parts.push(`${day}日`);
    if (dayOfWeek !== undefined && dayOfWeek !== '*') {
      const dayNames: Record<string, string> = {
        mon: '周一',
        tue: '周二',
        wed: '周三',
        thu: '周四',
        fri: '周五',
        sat: '周六',
        sun: '周日',
      };
      parts.push(dayOfWeek in dayNames ? dayNames[dayOfWeek] : String(dayOfWeek));
    }
    const h = hour !== undefined ? String(hour).padStart(2, '0') : '00';
    const m = minute !== undefined ? String(minute).padStart(2, '0') : '00';
    parts.push(`${h}:${m}`);
    return parts.length > 1 ? parts.join(' ') : `每天 ${h}:${m}`;
  }

  if (scheduleType === 'interval') {
    const seconds = scheduleConfig.seconds as number | undefined;
    const minutes = scheduleConfig.minutes as number | undefined;
    const hours = scheduleConfig.hours as number | undefined;
    const days = scheduleConfig.days as number | undefined;

    if (seconds !== undefined && seconds > 0) return `每 ${seconds} 秒`;
    if (minutes !== undefined && minutes > 0) return `每 ${minutes} 分钟`;
    if (hours !== undefined && hours > 0) return `每 ${hours} 小时`;
    if (days !== undefined && days > 0) return `每 ${days} 天`;
    return '固定间隔';
  }

  if (scheduleType === 'one_shot') {
    const runAt = scheduleConfig.run_at as string | undefined;
    if (runAt) {
      try {
        const d = new Date(runAt);
        return `${d.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}（一次性）`;
      } catch {
        return runAt;
      }
    }
    return '一次性';
  }

  return '未知调度';
}

// ============================================================
// API 方法
// ============================================================

export const scheduledTaskApi = {
  async listTasks(params?: {
    status?: string;
    task_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<ScheduledTaskListResponse> {
    const response = await api.get<ScheduledTaskListResponse>(
      '/api/v1/scheduled-tasks',
      { params }
    );
    return response.data;
  },

  async getTask(taskId: string): Promise<ScheduledTask> {
    const response = await api.get<ScheduledTask>(
      `/api/v1/scheduled-tasks/${taskId}`
    );
    return response.data;
  },

  async createTask(data: ScheduledTaskCreate): Promise<ScheduledTask> {
    const response = await api.post<ScheduledTask>(
      '/api/v1/scheduled-tasks',
      data
    );
    return response.data;
  },

  async updateTask(
    taskId: string,
    data: ScheduledTaskUpdate
  ): Promise<ScheduledTask> {
    const response = await api.put<ScheduledTask>(
      `/api/v1/scheduled-tasks/${taskId}`,
      data
    );
    return response.data;
  },

  async deleteTask(taskId: string): Promise<void> {
    await api.delete(`/api/v1/scheduled-tasks/${taskId}`);
  },

  async pauseTask(taskId: string): Promise<ScheduledTask> {
    const response = await api.post<ScheduledTask>(
      `/api/v1/scheduled-tasks/${taskId}/pause`
    );
    return response.data;
  },

  async resumeTask(taskId: string): Promise<ScheduledTask> {
    const response = await api.post<ScheduledTask>(
      `/api/v1/scheduled-tasks/${taskId}/resume`
    );
    return response.data;
  },

  async triggerTask(taskId: string): Promise<ScheduledTask> {
    const response = await api.post<ScheduledTask>(
      `/api/v1/scheduled-tasks/${taskId}/trigger`
    );
    return response.data;
  },
};
