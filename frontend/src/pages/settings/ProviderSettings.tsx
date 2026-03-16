import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { useToast } from '../../hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, Wifi, Server } from 'lucide-react';
import {
  getSystemConfig,
  updateSystemConfig,
  fetchUpstreamModels,
  type ProvidersMap,
  type ProviderConfig,
} from '../../lib/systemConfigApi';

interface ProviderFormData {
  id: string;
  name: string;
  api_base_url: string;
  api_key: string;
  sdk: string;
}

const SDK_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google-genai', label: 'Google GenAI' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
] as const;

const EMPTY_FORM: ProviderFormData = { id: '', name: '', api_base_url: '', api_key: '', sdk: 'openai' };

export function ProviderSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProvidersMap>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = adding new
  const [form, setForm] = useState<ProviderFormData>(EMPTY_FORM);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const resp = await getSystemConfig<ProvidersMap>('providers');
      setProviders(resp.value || {});
    } catch {
      // May not exist yet — use empty
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (id: string) => {
    const prov = providers[id];
    if (!prov) return;
    setEditingId(id);
    setForm({
      id,
      name: prov.name,
      api_base_url: prov.api_base_url,
      api_key: '', // Don't prefill masked key
      sdk: prov.sdk || 'openai',
    });
    setDialogOpen(true);
  };

  const handleSaveProvider = async () => {
    if (!form.id.trim()) {
      toast({ title: '请输入 Provider ID', variant: 'destructive' });
      return;
    }
    if (!form.api_base_url.trim()) {
      toast({ title: '请输入 API Base URL', variant: 'destructive' });
      return;
    }

    // When editing, if api_key is empty, preserve existing value
    const isEditing = editingId !== null;
    const updated: ProvidersMap = { ...providers };

    const newEntry: ProviderConfig = {
      name: form.name.trim() || form.id.trim(),
      api_base_url: form.api_base_url.trim(),
      api_key: form.api_key.trim() || null,
      sdk: form.sdk || 'openai',
    };

    // If editing and key left blank, keep existing (server has the real key)
    if (isEditing && !form.api_key.trim()) {
      // Preserve the existing api_key from server by not including it
      // The backend already stores the real key — we just don't overwrite with empty
      const existing = providers[editingId!];
      if (existing?.api_key) {
        newEntry.api_key = existing.api_key;
      }
    }

    // If renaming ID, remove old key
    if (isEditing && editingId !== form.id.trim()) {
      delete updated[editingId!];
    }

    updated[form.id.trim()] = newEntry;

    setSaving(true);
    try {
      await updateSystemConfig('providers', updated);
      toast({ title: '保存成功', description: `Provider "${form.id.trim()}" 已保存` });
      setDialogOpen(false);
      await loadProviders(); // Reload to get masked keys
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

  const handleDelete = async () => {
    if (!deleteId) return;
    const updated = { ...providers };
    delete updated[deleteId];

    setSaving(true);
    try {
      await updateSystemConfig('providers', updated);
      toast({ title: '已删除', description: `Provider "${deleteId}" 已移除` });
      setDeleteId(null);
      await loadProviders();
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.response?.data?.detail || String(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTestingId(providerId);
    try {
      const models = await fetchUpstreamModels({ providerId });
      toast({
        title: '连接成功',
        description: `获取到 ${models.length} 个模型`,
      });
    } catch (error: any) {
      toast({
        title: '连接失败',
        description: error.response?.data?.detail || String(error),
        variant: 'destructive',
      });
    } finally {
      setTestingId(null);
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

  const providerEntries = Object.entries(providers);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                模型服务商
              </CardTitle>
              <CardDescription className="mt-1.5">
                注册模型服务商，配置 API 地址和密钥。其他模块可引用已注册的服务商。
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {providerEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              暂无服务商，点击"添加"按钮开始配置
            </p>
          ) : (
            <div className="space-y-3">
              {providerEntries.map(([id, prov]) => (
                <div
                  key={id}
                  className="flex items-center justify-between border rounded-lg p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{prov.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {id}
                      </span>
                      {prov.sdk && (
                        <Badge variant="secondary" className="text-xs">
                          {prov.sdk}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">
                      {prov.api_base_url}
                    </div>
                    {prov.api_key && (
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                        Key: {prov.api_key}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestConnection(id)}
                      disabled={testingId === id}
                      title="测试连接"
                    >
                      {testingId === id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(id)}
                      title="编辑"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(id)}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? '编辑服务商' : '添加服务商'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? '修改服务商配置，留空 API Key 则保留原值'
                : '添加新的模型服务商'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Provider ID</Label>
              <Input
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="openai"
                disabled={editingId !== null}
              />
              <p className="text-xs text-muted-foreground">
                唯一标识符，创建后不可修改
              </p>
            </div>
            <div className="space-y-2">
              <Label>显示名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="OpenAI"
              />
            </div>
            <div className="space-y-2">
              <Label>SDK 类型</Label>
              <Select
                value={form.sdk}
                onValueChange={(value) => setForm({ ...form, sdk: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 SDK 类型" />
                </SelectTrigger>
                <SelectContent>
                  {SDK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                LangChain 使用的 SDK 类型，决定如何调用此服务商的 API
              </p>
            </div>
            <div className="space-y-2">
              <Label>API Base URL</Label>
              <Input
                value={form.api_base_url}
                onChange={(e) =>
                  setForm({ ...form, api_base_url: e.target.value })
                }
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm({ ...form, api_key: e.target.value })
                }
                placeholder={editingId ? '留空保留原值' : '可选，不填则使用环境变量'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveProvider} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除服务商 "{deleteId}" 吗？引用该服务商的模块将回退到环境变量配置。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              {saving ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
