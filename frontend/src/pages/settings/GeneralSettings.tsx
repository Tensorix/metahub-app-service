import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { useThemeStore } from '../../store/theme';
import { useAuthStore } from '../../store/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { apiKeyApi, authApi } from '../../lib/api';
import { getSystemConfig, updateSystemConfig } from '../../lib/systemConfigApi';
import { Copy, RefreshCw, Eye, EyeOff, Key, UserPlus } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

export function GeneralSettings() {
  const { theme, setTheme } = useThemeStore();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [registrationDisabled, setRegistrationDisabled] = useState(false);
  const [authConfigLoading, setAuthConfigLoading] = useState(false);
  const [authConfigSaving, setAuthConfigSaving] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  useEffect(() => {
    if (!user?.is_superuser) return;
    let cancelled = false;
    const load = async () => {
      setAuthConfigLoading(true);
      try {
        const res = await getSystemConfig<{ registration_disabled?: boolean }>('auth');
        if (!cancelled) setRegistrationDisabled(!!res.value?.registration_disabled);
      } catch (error: any) {
        if (error.response?.status === 404 && !cancelled) {
          setRegistrationDisabled(false);
        } else if (!cancelled) {
          toast({
            title: '加载失败',
            description: error.response?.data?.detail || '无法读取注册设置',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setAuthConfigLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.is_superuser]);

  const loadApiKey = async () => {
    try {
      const user = await authApi.getMe();
      if (user.api_key) {
        setApiKey(user.api_key);
        setHasApiKey(true);
      }
    } catch {
      setHasApiKey(false);
    }
  };

  const handleGenerateApiKey = async () => {
    setLoading(true);
    try {
      const response = await apiKeyApi.generate();
      setApiKey(response.api_key);
      setHasApiKey(true);
      setShowApiKey(true);
      toast({ title: '成功', description: 'API Key 已生成' });
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.response?.data?.detail || '生成 API Key 失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetApiKey = async () => {
    if (!confirm('重置 API Key 将使旧的 Key 失效，确定要继续吗？')) return;

    setLoading(true);
    try {
      const response = await apiKeyApi.reset();
      setApiKey(response.api_key);
      setShowApiKey(true);
      toast({ title: '成功', description: response.message });
    } catch (error: any) {
      toast({
        title: '错误',
        description: error.response?.data?.detail || '重置 API Key 失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast({ title: '已复制', description: 'API Key 已复制到剪贴板' });
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 10) return key;
    return `${key.substring(0, 10)}${'*'.repeat(key.length - 10)}`;
  };

  const handleRegistrationDisabledChange = async (checked: boolean) => {
    setAuthConfigSaving(true);
    try {
      await updateSystemConfig('auth', { registration_disabled: checked });
      setRegistrationDisabled(checked);
      toast({
        title: '已保存',
        description: checked ? '已禁止新用户注册' : '已允许新用户注册',
      });
    } catch (error: any) {
      toast({
        title: '保存失败',
        description: error.response?.data?.detail || '更新注册设置失败',
        variant: 'destructive',
      });
    } finally {
      setAuthConfigSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {user?.is_superuser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              用户注册
            </CardTitle>
            <CardDescription>控制是否允许新用户在登录页自助注册账号</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="registration-disabled" className="text-base">
                  禁用注册
                </Label>
                <p className="text-sm text-muted-foreground">
                  开启后，新用户将无法注册；已登录用户不受影响。
                </p>
              </div>
              <Switch
                id="registration-disabled"
                checked={registrationDisabled}
                onCheckedChange={handleRegistrationDisabledChange}
                disabled={authConfigLoading || authConfigSaving}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key
          </CardTitle>
          <CardDescription>用于 API 调用的密钥，请妥善保管</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasApiKey && apiKey ? (
            <>
              <div className="space-y-2">
                <Label>您的 API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      value={showApiKey ? apiKey : maskApiKey(apiKey)}
                      readOnly
                      className="pr-10 font-mono text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button variant="outline" size="icon" onClick={handleCopyApiKey} title="复制">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleResetApiKey}
                    disabled={loading}
                    title="重置"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                重置 API Key 将使旧的 Key 立即失效
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                您还没有生成 API Key，点击下方按钮生成
              </p>
              <Button onClick={handleGenerateApiKey} disabled={loading}>
                {loading ? '生成中...' : '生成 API Key'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>自定义应用的外观和主题</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>主题模式</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
              >
                浅色
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
              >
                深色
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                onClick={() => setTheme('system')}
              >
                跟随系统
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
