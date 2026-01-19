import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  
  setTheme: (theme: Theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
    
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  },
}));

// 初始化主题
const initTheme = () => {
  const theme = (localStorage.getItem('theme') as Theme) || 'system';
  const root = window.document.documentElement;
  
  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }
};

initTheme();
