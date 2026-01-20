import { create } from 'zustand';
import { authApi, type User } from '../lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username: string, password: string) => {
    const tokenResponse = await authApi.login({ username, password });
    localStorage.setItem('access_token', tokenResponse.access_token);
    localStorage.setItem('refresh_token', tokenResponse.refresh_token);
    
    const user = await authApi.getMe();
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  register: async (username: string, password: string, email?: string, phone?: string) => {
    await authApi.register({ username, password, email, phone });
    // 注册成功后自动登录
    await useAuthStore.getState().login(username, password);
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    try {
      await authApi.logout(refreshToken || undefined);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });
    }
  },

  fetchUser: async () => {
    try {
      const user = await authApi.getMe();
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    } catch (error) {
      console.error('Fetch user error:', error);
      set({ user: null, isAuthenticated: false });
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, isAuthenticated: true });
        // 验证 token 是否有效
        await useAuthStore.getState().fetchUser();
      } catch (error) {
        console.error('Initialize error:', error);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        set({ user: null, isAuthenticated: false });
      }
    }
    set({ isLoading: false });
  },
}));
