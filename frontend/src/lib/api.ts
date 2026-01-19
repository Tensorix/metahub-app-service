import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

          if (data.code === '200') {
            localStorage.setItem('access_token', data.data.access_token);
            localStorage.setItem('refresh_token', data.data.refresh_token);
            originalRequest.headers.Authorization = `Bearer ${data.data.access_token}`;
            return api(originalRequest);
          }
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
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

// Auth API
export const authApi = {
  async register(data: RegisterData): Promise<ApiResponse<User>> {
    const hashedPassword = await sha256(data.password);
    const response = await api.post('/api/v1/auth/register', {
      ...data,
      password: hashedPassword,
    });
    return response.data;
  },

  async login(data: LoginData): Promise<ApiResponse<TokenResponse>> {
    const hashedPassword = await sha256(data.password);
    const response = await api.post('/api/v1/auth/login', {
      ...data,
      password: hashedPassword,
      client_type: data.client_type || 'web',
    });
    return response.data;
  },

  async logout(refreshToken?: string): Promise<ApiResponse<null>> {
    const response = await api.post('/api/v1/auth/logout', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  async getMe(): Promise<ApiResponse<User>> {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },

  async refresh(refreshToken: string): Promise<ApiResponse<TokenResponse>> {
    const response = await api.post('/api/v1/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },
};
