import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { useThemeStore } from '../store/theme';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { apiKeyApi, authApi } from '../lib/api';
import { Copy, RefreshCw, Eye, EyeOff, Key, Database } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { Badge } from '../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  getEmbeddingStatus,
  listEmbeddingModels,
  switchEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingStatus,
} from '../lib/embeddingApi';

export function Settings() {
  const { theme, setTheme } = useThemeStore();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  
  // Embedding states
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModel[]>([]);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    loadApiKey();
    loadEmbeddingData();
  }, []);

  const loadApiKey = async () => {
    try {
      const user = await authApi.getMe();
      if (user.api_key) {
        setApiKey(user.api_key);
        setHasApiKey(true);
      }
    } catch (error) {
      // 用户可能还没有 API Key
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
      toast({
        title: '成功',
        description: 'API Key 已生成',
      });
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
    if (!confirm('重置 API Key 将使旧的 Key 失效，确定要继续吗？')) {
      return;
    }

    setLoading(true);
    try {
      const response = await apiKeyApi.reset();
      setApiKey(response.api_key);
      setShowApiKey(true);
      toast({
        title: '成功',
        description: response.message,
      });
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
      toast({
        title: '已复制',
        description: 'API Key 已复制到剪贴板',
      });
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 10) return key;
    return `${key.substring(0, 10)}${'*'.repeat(key.length - 10)}`;
  };

  const loadEmbeddingData = async () => {
    try {
      setEmbeddingLoading(true);
      const [statusData, modelsData] = await Promise.all([
        getEmbeddingStatus("message"),
        listEmbeddingModels(),
      ]);
      setEmbeddingStatus(statusData);
      setEmbeddingModels(modelsData?.models || []);
    } catch (error) {
      console.error("Failed to load embedding data:", error);
      setEmbeddingModels([]);
    } finally {
      setEmbeddingLoading(false);
    }
  };

  const handleSwitchModel = (modelId: string) => {
    setSelectedModel(modelId);
    setShowConfirmDialog(true);
  };

  const confirmSwitch = async () => {
    if (!selectedModel) return;

    try {
      setSwitching(true);
      const response = await switchEmbeddingModel({
        category: "message",
        model_id: selectedModel,
      });

      toast({
        title: "切换成功",
        description: response.note || `已切换到模型: ${selectedModel}`,
      });

      await loadEmbeddingData();
    } catch (error) {
      console.error("Failed to switch model:", error);
      toast({
        title: "切换失败",
        description: "无法切换 Embedding 模型",
        variant: "destructive",
      });
    } finally {
      setSwitching(false);
      setShowConfirmDialog(false);
      setSelectedModel(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 pb-4">
        <h1 className="text-3xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-2">
          管理您的应用偏好设置
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">{/* 添加滚动容器 */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key
          </CardTitle>
          <CardDescription>
            用于 API 调用的密钥，请妥善保管
          </CardDescription>
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
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyApiKey}
                    title="复制"
                  >
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
                ⚠️ 重置 API Key 将使旧的 Key 立即失效
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Embedding 模型
          </CardTitle>
          <CardDescription>
            管理消息搜索的向量嵌入模型
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {embeddingLoading ? (
            <div className="text-center py-4 text-muted-foreground">加载中...</div>
          ) : (
            <>
              {/* Current Status */}
              {embeddingStatus && (
                <div className="space-y-4 pb-4 border-b">
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
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">总索引数: </span>
                      <span className="font-medium">{embeddingStatus.total_indices}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">已完成 Embedding: </span>
                      <span className="font-medium">{embeddingStatus.completed_embeddings}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Available Models */}
              <div className="space-y-3">
                <Label>可用模型</Label>
                {embeddingModels && embeddingModels.length > 0 ? (
                  embeddingModels.map((model) => {
                    const isActive = embeddingStatus?.active_model === model.model_id;
                    return (
                      <div
                        key={model.model_id}
                        className={`flex items-center justify-between p-3 border rounded-lg ${
                          isActive ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">{model.model_id}</h4>
                            {isActive && <Badge variant="default" className="text-xs">当前使用</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            <span className="mr-3">Provider: {model.provider}</span>
                            <span className="mr-3">模型: {model.model_name}</span>
                            <span>维度: {model.dimensions}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSwitchModel(model.model_id)}
                          disabled={isActive || switching}
                          variant={isActive ? "outline" : "default"}
                        >
                          {isActive ? "使用中" : "切换"}
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    暂无可用模型
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="pt-4 border-t space-y-2 text-xs text-muted-foreground">
                <p>⚠️ 切换模型后需要重新生成所有 Embeddings</p>
                <p>💡 在重新索引期间，模糊搜索功能不受影响</p>
                <details className="cursor-pointer">
                  <summary className="font-medium">批量回填命令</summary>
                  <code className="block mt-2 p-2 bg-muted rounded text-xs">
                    python scripts/backfill_search_index.py --user-id &lt;uuid&gt; --regenerate-embeddings
                  </code>
                </details>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账户</CardTitle>
          <CardDescription>管理您的账户设置</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            账户管理功能即将推出
          </p>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认切换模型</AlertDialogTitle>
            <AlertDialogDescription>
              你确定要切换到模型 <strong>{selectedModel}</strong> 吗？
              <br />
              <br />
              切换后需要重新生成所有 Embeddings。在重新索引完成前，向量搜索可能返回不完整的结果。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch} disabled={switching}>
              {switching ? "切换中..." : "确认切换"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>{/* 关闭滚动容器 */}
    </div>
  );
}
