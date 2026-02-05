import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Search,
  Database,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { searchIndexApi, type SessionSearchIndexStats, type ReindexResponse, type BackfillEmbeddingsResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface SearchIndexManagerProps {
  sessionId: string;
  sessionName?: string;
}

export function SearchIndexManager({ sessionId, sessionName }: SearchIndexManagerProps) {
  const [stats, setStats] = useState<SessionSearchIndexStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [skipEmbedding, setSkipEmbedding] = useState(false);
  const [showReindexDialog, setShowReindexDialog] = useState(false);
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadStats();
  }, [sessionId]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await searchIndexApi.getSessionStats(sessionId);
      setStats(data);
    } catch (error) {
      console.error('Failed to load search index stats:', error);
      toast({
        title: '加载失败',
        description: '无法获取搜索索引统计信息',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReindex = async () => {
    setShowReindexDialog(false);
    setReindexing(true);
    try {
      const result: ReindexResponse = await searchIndexApi.reindexSession(sessionId, {
        skip_embedding: skipEmbedding,
        regenerate_embeddings: false,
      });
      
      toast({
        title: '重建索引完成',
        description: `成功索引 ${result.indexed_count} 条消息，跳过 ${result.skipped_count} 条`,
      });
      
      // 刷新统计
      await loadStats();
    } catch (error: any) {
      toast({
        title: '重建索引失败',
        description: error.response?.data?.detail || '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setReindexing(false);
    }
  };

  const handleBackfill = async () => {
    setShowBackfillDialog(false);
    setBackfilling(true);
    try {
      const result: BackfillEmbeddingsResponse = await searchIndexApi.backfillSessionEmbeddings(sessionId, {
        batch_size: 50,
      });
      
      toast({
        title: '补建 Embedding 完成',
        description: `成功处理 ${result.succeeded} 条，失败 ${result.failed} 条`,
      });
      
      // 刷新统计
      await loadStats();
    } catch (error: any) {
      toast({
        title: '补建 Embedding 失败',
        description: error.response?.data?.detail || '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setBackfilling(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <AlertCircle className="h-5 w-5 mr-2" />
          无法加载索引状态
        </CardContent>
      </Card>
    );
  }

  const coveragePercent = Math.round(stats.index_coverage * 100);
  const embeddingPercent = stats.indexed_messages > 0 
    ? Math.round((stats.embedding_completed / stats.indexed_messages) * 100)
    : 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            搜索索引
          </CardTitle>
          <CardDescription>
            管理会话的搜索索引，支持模糊搜索和语义搜索
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 索引状态概览 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">索引覆盖率</span>
                <span className="font-medium">{coveragePercent}%</span>
              </div>
              <Progress value={coveragePercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {stats.indexed_messages} / {stats.total_messages} 条消息
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">向量索引</span>
                <span className="font-medium">{embeddingPercent}%</span>
              </div>
              <Progress value={embeddingPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {stats.embedding_completed} / {stats.indexed_messages} 条
              </p>
            </div>
          </div>

          {/* 状态标签 */}
          <div className="flex flex-wrap gap-2">
            {coveragePercent === 100 ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                索引完整
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                <AlertCircle className="h-3 w-3 mr-1" />
                {stats.total_messages - stats.indexed_messages} 条待索引
              </Badge>
            )}
            {stats.no_embedding > 0 && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                <Database className="h-3 w-3 mr-1" />
                {stats.no_embedding} 条仅文本索引
              </Badge>
            )}
          </div>

          <Separator />

          {/* 操作区域 */}
          <div className="space-y-3">
            {/* 重建索引 */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">重建索引</p>
                <p className="text-xs text-muted-foreground">
                  为未索引的消息创建搜索索引
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReindexDialog(true)}
                disabled={reindexing || stats.total_messages === stats.indexed_messages}
              >
                {reindexing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                重建
              </Button>
            </div>

            {/* 补建 Embedding */}
            {stats.no_embedding > 0 && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">补建向量索引</p>
                  <p className="text-xs text-muted-foreground">
                    为仅有文本索引的消息生成向量（启用语义搜索）
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBackfillDialog(true)}
                  disabled={backfilling}
                >
                  {backfilling ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  补建
                </Button>
              </div>
            )}
          </div>

          {/* 提示信息 */}
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              文本索引支持模糊搜索（关键词匹配）。向量索引额外支持语义搜索（理解意图），
              但会产生 API 调用费用。可先只建文本索引，后续按需补建向量。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 重建索引确认对话框 */}
      <AlertDialog open={showReindexDialog} onOpenChange={setShowReindexDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重建搜索索引</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  将为会话 "{sessionName || '未命名会话'}" 中未索引的{' '}
                  <strong>{stats.total_messages - stats.indexed_messages}</strong> 条消息创建搜索索引。
                </p>
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-md">
                  <Switch
                    id="skip-embedding"
                    checked={skipEmbedding}
                    onCheckedChange={setSkipEmbedding}
                  />
                  <Label htmlFor="skip-embedding" className="text-sm cursor-pointer">
                    跳过向量生成（仅创建文本索引，节省 API 成本）
                  </Label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleReindex}>
              开始重建
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 补建 Embedding 确认对话框 */}
      <AlertDialog open={showBackfillDialog} onOpenChange={setShowBackfillDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>补建向量索引</AlertDialogTitle>
            <AlertDialogDescription>
              将为 <strong>{stats.no_embedding}</strong> 条仅有文本索引的消息生成向量索引。
              这将启用语义搜索功能，但会产生 Embedding API 调用费用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBackfill}>
              开始补建
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
