import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { useThemeStore } from '../../store/theme';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { apiKeyApi, authApi } from '../../lib/api';
import { Copy, RefreshCw, Eye, EyeOff, Key } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

export function GeneralSettings() {
  const { theme, setTheme } = useThemeStore();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

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

  return (
    <div className="space-y-6">
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
