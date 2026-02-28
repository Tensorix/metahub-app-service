import { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@lobehub/ui';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Toaster } from './components/ui/toaster';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Home } from './pages/Home';
import { Sessions } from './pages/Sessions';
import { Settings } from './pages/Settings';
import Agents from './pages/Agents';
import Activities from './pages/Activities';
import Knowledge from './pages/Knowledge';
import ScheduledTasks from './pages/ScheduledTasks';

function App() {
  const { initialize } = useAuthStore();
  const theme = useThemeStore((s) => s.theme);

  // Map app theme to antd-style themeMode: 'light' | 'dark' | 'auto'
  const themeMode = useMemo(
    () => (theme === 'system' ? 'auto' : theme) as 'light' | 'dark' | 'auto',
    [theme],
  );

  // Resolve actual dark/light for antd token overrides (needed when theme===system)
  const isDark = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ThemeProvider
      themeMode={themeMode}
      enableCustomFonts={false}
      enableGlobalStyle={false}
      theme={{
        token: {
          // Override antd's default blue (#1677ff) with neutral colors
          // to match the app's black/white shadcn design system
          colorPrimary: isDark ? '#e4e4e7' : '#18181b',
          colorLink: isDark ? '#e4e4e7' : '#18181b',
          colorLinkHover: isDark ? '#ffffff' : '#09090b',
          colorLinkActive: isDark ? '#ffffff' : '#09090b',
          colorInfo: isDark ? '#e4e4e7' : '#18181b',
          colorFillSecondary: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:sessionId" element={<Sessions />} />
            <Route path="sessions/:sessionId/topics/:topicId" element={<Sessions />} />
            <Route path="agents" element={<Agents />} />
            <Route path="activities" element={<Activities />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="scheduled-tasks" element={<ScheduledTasks />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
