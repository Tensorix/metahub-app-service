import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { useAuthStore } from '../store/auth';
import { ThemeToggle } from '../components/ThemeToggle';
import { fadeUpIndexed as fadeUp } from '@/lib/motion';

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      {/* Decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-brand/[0.04] blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 h-[500px] w-[500px] rounded-full bg-brand/[0.03] blur-3xl" />
      </div>

      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        className="relative w-full max-w-sm"
      >
        {/* Brand */}
        <motion.div custom={0} variants={fadeUp} className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background">
            <span className="text-lg font-bold tracking-tight">M</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            登录您的 MetaHub 账户
          </p>
        </motion.div>

        {/* Form */}
        <motion.form custom={1} variants={fadeUp} onSubmit={handleSubmit}>
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">用户名 / 邮箱 / 手机号</Label>
              <Input
                id="username"
                type="text"
                placeholder="请输入用户名、邮箱或手机号"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
                className="h-11"
              />
            </div>

            <Button
              type="submit"
              className="h-11 w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </Button>
          </div>
        </motion.form>

        <motion.p
          custom={2}
          variants={fadeUp}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          还没有账户？{' '}
          <Link
            to="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            立即注册
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
