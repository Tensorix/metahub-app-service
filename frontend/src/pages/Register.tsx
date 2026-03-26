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
import { isPasswordStrengthCheckEnabled } from '@/config/env';
import { fadeUpIndexed as fadeUp } from '@/lib/motion';

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuthStore();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const enablePasswordStrengthCheck = isPasswordStrengthCheckEnabled();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validateForm = () => {
    if (formData.username.length < 3) {
      setError('用户名至少需要 3 个字符');
      return false;
    }

    if (formData.password.length < 8) {
      setError('密码至少需要 8 个字符');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return false;
    }

    if (enablePasswordStrengthCheck) {
      const hasUpperCase = /[A-Z]/.test(formData.password);
      const hasLowerCase = /[a-z]/.test(formData.password);
      const hasNumber = /\d/.test(formData.password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(formData.password);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
        setError('密码需包含大小写字母、数字和特殊字符');
        return false;
      }
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('邮箱格式不正确');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setLoading(true);
    try {
      await register(
        formData.username,
        formData.password,
        formData.email || undefined,
        formData.phone || undefined
      );
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || '注册失败，请稍后重试');
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
            创建账户
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            填写以下信息以注册 MetaHub
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
              <Label htmlFor="username">用户名 *</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="至少 3 个字符"
                value={formData.username}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="username"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="your@email.com（可选）"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                autoComplete="email"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="手机号（可选）"
                value={formData.phone}
                onChange={handleChange}
                disabled={loading}
                autoComplete="tel"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码 *</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={
                  enablePasswordStrengthCheck
                    ? '至少 8 位，包含大小写字母、数字和特殊字符'
                    : '至少 8 个字符'
                }
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="new-password"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码 *</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="再次输入密码"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="new-password"
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
                  注册中...
                </>
              ) : (
                '注册'
              )}
            </Button>
          </div>
        </motion.form>

        <motion.p
          custom={2}
          variants={fadeUp}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          已有账户？{' '}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            立即登录
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
