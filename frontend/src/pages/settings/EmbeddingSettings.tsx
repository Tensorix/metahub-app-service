import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { ModelSelect } from '../../components/ModelSelect';
import { useToast } from '../../hooks/use-toast';
import { Loader2, Database } from 'lucide-react';
import {
  getSystemConfig,
  updateSystemConfig,
  fetchUpstreamModels,
  type EmbeddingConfig,
  type ProvidersMap,
  type UpstreamModel,
} from '../../lib/systemConfigApi';
import {
  getEmbeddingStatus,
  type EmbeddingStatus,
} from '../../lib/embeddingApi';

export function EmbeddingSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [models, setModels] = useState<UpstreamModel[]>([]);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [providerIds, setProviderIds] = useState<string[]>([]);

  const [provider, setProvider] = useState('openai');
  const [modelName, setModelName] = useState('text-embedding-3-large');
  const [dimensions, setDimensions] = useState(3072);
  const [maxTokens, setMaxTokens] = useState(8191);
  const [batchSize, setBatchSize] = useState(100);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configResp, statusData, providersResp] = await Promise.all([
        getSystemConfig<EmbeddingConfig>('embedding').catch(() => null),
        getEmbeddingStatus('message').catch(() => null),
        getSystemConfig<ProvidersMap>('providers').catch(() => null),
      ]);

      if (configResp?.value) {
        const v = configResp.value;
        setProvider(v.provider || 'openai');
        setModelName(v.model_name || 'text-embedding-3-large');
        setDimensions(v.dimensions || 3072);
        setMaxTokens(v.max_tokens || 8191);
        setBatchSize(v.batch_size || 100);
      }

      setEmbeddingStatus(statusData);

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
      await updateSystemConfig('embedding', {
        provider,
        model_name: modelName,
        dimensions,
        max_tokens: maxTokens,
        batch_size: batchSize,
      });
      toast({ title: '保存成功', description: '向量嵌入配置已更新' });
      // Refresh status
      const statusData = await getEmbeddingStatus('message').catch(() => null);
      setEmbeddingStatus(statusData);
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
      {/* Status Card */}
      {embeddingStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">当前状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">活跃模型</div>
                <div className="text-lg font-semibold">{embeddingStatus.active_model}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Provider</div>
                <div className="text-lg font-semibold">{embeddingStatus.model_provider}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">向量维度</div>
                <div className="text-lg font-semibold">{embeddingStatus.model_dimensions}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">覆盖率</div>
                <div className="text-lg font-semibold">{embeddingStatus.coverage}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm mt-3">
              <div>
                <span className="text-muted-foreground">总索引数: </span>
                <span className="font-medium">{embeddingStatus.total_indices}</span>
              </div>
              <div>
                <span className="text-muted-foreground">已完成 Embedding: </span>
                <span className="font-medium">{embeddingStatus.completed_embeddings}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            向量嵌入配置
          </CardTitle>
          <CardDescription>配置消息搜索的向量嵌入模型参数</CardDescription>
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
              <Button variant="outline" onClick={handleFetchModels} disabled={fetchingModels}>
                {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
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
              placeholder="text-embedding-3-large"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>向量维度</Label>
              <Input
                type="number"
                value={dimensions}
                onChange={(e) => setDimensions(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <Input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="pt-2 space-y-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>切换模型或维度后需要重新生成所有 Embeddings</p>
              <p>在重新索引期间，模糊搜索功能不受影响</p>
              <details className="cursor-pointer">
                <summary className="font-medium">批量回填命令</summary>
                <code className="block mt-2 p-2 bg-muted rounded text-xs">
                  python scripts/backfill_search_index.py --user-id &lt;uuid&gt; --regenerate-embeddings
                </code>
              </details>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
