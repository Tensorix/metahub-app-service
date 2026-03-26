/**
 * Embedding Management Page
 * 
 * Allows administrators to:
 * - View current embedding model status
 * - See all available models
 * - Switch between models
 * - Monitor embedding coverage
 */

import { useEffect, useState } from "react";
import {
  getEmbeddingStatus,
  listEmbeddingModels,
  switchEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingStatus,
} from "@/lib/embeddingApi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function EmbeddingManagement() {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [models, setModels] = useState<EmbeddingModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const [statusData, modelsData] = await Promise.all([
        getEmbeddingStatus("message"),
        listEmbeddingModels(),
      ]);
      setStatus(statusData);
      setModels(modelsData?.models || []);
    } catch (error) {
      console.error("Failed to load embedding data:", error);
      toast({
        title: "加载失败",
        description: "无法加载 Embedding 配置信息",
        variant: "destructive",
      });
      setModels([]); // Ensure models is always an array
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

      // Reload status
      await loadData();
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

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-h-screen overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold">Embedding 模型管理</h1>
        <p className="text-muted-foreground mt-2">
          管理消息搜索的向量嵌入模型
        </p>
      </div>

      {/* Current Status */}
      {status && (
        <Card>
          <CardHeader>
            <CardTitle>当前状态</CardTitle>
            <CardDescription>消息搜索的 Embedding 配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">活跃模型</div>
                <div className="text-2xl font-bold">{status.active_model}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Provider</div>
                <div className="text-2xl font-bold">
                  {status.model_provider}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">向量维度</div>
                <div className="text-2xl font-bold">
                  {status.model_dimensions}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">覆盖率</div>
                <div className="text-2xl font-bold">{status.coverage}</div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">总索引数: </span>
                  <span className="font-medium">{status.total_indices}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">已完成 Embedding: </span>
                  <span className="font-medium">
                    {status.completed_embeddings}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Models */}
      <Card>
        <CardHeader>
          <CardTitle>可用模型</CardTitle>
          <CardDescription>
            选择一个模型来切换。切换后需要重新生成所有 Embeddings。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {models && models.length > 0 ? models.map((model) => {
              const isActive = status?.active_model === model.model_id;
              return (
                <div
                  key={model.model_id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    isActive ? "border-brand bg-brand/5" : ""
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{model.model_id}</h3>
                      {isActive && (
                        <Badge variant="default">当前使用</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="mr-4">
                        Provider: {model.provider}
                      </span>
                      <span className="mr-4">
                        模型: {model.model_name}
                      </span>
                      <span>维度: {model.dimensions}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleSwitchModel(model.model_id)}
                    disabled={isActive || switching}
                    variant={isActive ? "outline" : "default"}
                  >
                    {isActive ? "使用中" : "切换"}
                  </Button>
                </div>
              );
            }) : (
              <div className="text-center py-8 text-muted-foreground">
                暂无可用模型
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • <strong>切换模型</strong>：点击"切换"按钮后，系统会更新活跃模型配置
          </p>
          <p>
            • <strong>重新索引</strong>：切换模型后，需要运行批量回填脚本重新生成所有 Embeddings
          </p>
          <p>
            • <strong>模糊搜索</strong>：在重新索引期间，模糊搜索功能不受影响
          </p>
          <p>
            • <strong>向量搜索</strong>：在重新索引完成前，向量搜索可能返回不完整的结果
          </p>
          <p className="pt-2 border-t">
            <strong>批量回填命令：</strong>
            <code className="block mt-1 p-2 bg-muted rounded">
              python scripts/backfill_search_index.py --user-id &lt;uuid&gt;
              --regenerate-embeddings
            </code>
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
    </div>
  );
}
