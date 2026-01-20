import axios from 'axios';
import { getApiBaseUrl } from '@/config/env';

const API_BASE_URL = getApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
