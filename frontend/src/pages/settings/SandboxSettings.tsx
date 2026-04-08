import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { useToast } from '../../hooks/use-toast';
import { Loader2, Container } from 'lucide-react';
import {
  getSystemConfig,
  updateSystemConfig,
  type SandboxConfig,
} from '../../lib/systemConfigApi';

export function SandboxSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [apiDomain, setApiDomain] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [useServerProxy, setUseServerProxy] = useState(false);
  const [defaultImage, setDefaultImage] = useState('ubuntu');
  const [defaultTimeout, setDefaultTimeout] = useState(600);
  const [maxPerUser, setMaxPerUser] = useState(3);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const resp = await getSystemConfig<SandboxConfig>('sandbox').catch(() => null);
      if (resp?.value) {
        const v = resp.value;
        setEnabled(v.enabled ?? false);
        setApiDomain(v.api_domain ?? '');
        setApiKey(v.api_key ?? '');
        setUseServerProxy(v.use_server_proxy ?? false);
        setDefaultImage(v.default_image ?? 'ubuntu');
        setDefaultTimeout(v.default_timeout ?? 600);
        setMaxPerUser(v.max_per_user ?? 3);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemConfig('sandbox', {
        enabled,
        api_domain: apiDomain,
        api_key: apiKey,
        use_server_proxy: useServerProxy,
        default_image: defaultImage,
        default_timeout: defaultTimeout,
        max_per_user: maxPerUser,
      });
      toast({ title: '保存成功', description: '沙箱配置已更新' });
    } catch (error: any) {
      toast({
        title: '保存失败',
        description: error.response?.data?.detail || String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Container className="h-5 w-5" />
            沙箱配置
          </CardTitle>
          <CardDescription>
            配置云端代码执行沙箱（基于 OpenSandbox）。启用后，AI 会话可按需创建隔离的执行环境。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>启用沙箱</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                全局开关，关闭后无法创建新沙箱
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label>API Domain</Label>
            <Input
              placeholder="api.opensandbox.io"
              value={apiDomain}
              onChange={(e) => setApiDomain(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              保存后 API Key 将以掩码显示
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>使用服务端代理</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                当 API Domain 无法被应用直接访问时启用（例如容器网络隔离场景）
              </p>
            </div>
            <Switch checked={useServerProxy} onCheckedChange={setUseServerProxy} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>默认镜像</Label>
              <Input
                value={defaultImage}
                onChange={(e) => setDefaultImage(e.target.value)}
                placeholder="ubuntu"
              />
            </div>
            <div className="space-y-2">
              <Label>超时时间 (秒)</Label>
              <Input
                type="number"
                value={defaultTimeout}
                onChange={(e) => setDefaultTimeout(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>每用户上限</Label>
              <Input
                type="number"
                value={maxPerUser}
                onChange={(e) => setMaxPerUser(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
