import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { ModelSelect } from '../../components/ModelSelect';
import { useToast } from '../../hooks/use-toast';
import { Loader2, BrainCircuit } from 'lucide-react';
import {
  getSystemConfig,
  updateSystemConfig,
  fetchUpstreamModels,
  type MessageAnalyzerConfig,
  type ProvidersMap,
  type UpstreamModel,
} from '../../lib/systemConfigApi';

export function MessageAnalyzerSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [models, setModels] = useState<UpstreamModel[]>([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);

  const [provider, setProvider] = useState('openai');
  const [modelName, setModelName] = useState('gpt-4o-mini');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configResp, providersResp] = await Promise.all([
        getSystemConfig<MessageAnalyzerConfig>('message_analyzer').catch(() => null),
        getSystemConfig<ProvidersMap>('providers').catch(() => null),
      ]);

      if (configResp?.value) {
        const v = configResp.value;
        setProvider(v.provider || 'openai');
        setModelName(v.model_name || 'gpt-4o-mini');
      }

      if (providersResp?.value) {
        setProviderIds(Object.keys(providersResp.value));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFetchModels = async () => {
    if (!provider) {
      toast({ title: '请选择服务商', variant: 'destructive' });
      return;
    }
    setFetchingModels(true);
    try {
      const result = await fetchUpstreamModels({ providerId: provider });
      setModels(result);
      if (result.length === 0) {
        toast({ title: '未获取到模型', description: '上游返回空列表' });
      } else {
        toast({ title: '获取成功', description: `共 ${result.length} 个模型` });
      }
    } catch (error: any) {
      toast({
        title: '获取模型失败',
        description: error.response?.data?.detail || String(error),
        variant: 'destructive',
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemConfig('message_analyzer', {
        provider,
        model_name: modelName,
      });
      toast({ title: '保存成功', description: '消息分析器配置已更新' });
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5" />
          消息分析器配置
        </CardTitle>
        <CardDescription>
          配置用于自动分析 IM 消息并生成 Activity 的 LLM 模型
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>服务商</Label>
          <div className="flex gap-2">
            <Select value={provider} onValueChange={(v) => { setProvider(v); setModels([]); }}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="选择服务商" />
              </SelectTrigger>
              <SelectContent>
                {providerIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleFetchModels}
              disabled={fetchingModels}
            >
              {fetchingModels ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              获取模型
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>模型名称</Label>
          <ModelSelect
            value={modelName}
            onChange={setModelName}
            models={models}
            placeholder="gpt-4o-mini"
          />
          <p className="text-xs text-muted-foreground">
            可直接输入模型名称，或点击"获取模型"从上游拉取可用列表后输入关键词过滤
          </p>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
