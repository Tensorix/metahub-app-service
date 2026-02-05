import { useState, useEffect, useCallback, useRef } from 'react';
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
  Clock,
  XCircle,
  StopCircle,
} from 'lucide-react';
import { 
  searchIndexApi, 
  backgroundTaskApi,
  type SessionSearchIndexStats, 
  type BackgroundTask,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface SearchIndexManagerProps {
  sessionId: string;
  sessionName?: string;
}

export function SearchIndexManager({ sessionId, sessionName }: SearchIndexManagerProps) {
  const [stats, setStats] = useState<SessionSearchIndexStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipEmbedding, setSkipEmbedding] = useState(false);
  const [showReindexDialog, setShowReindexDialog] = useState(false);
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const [activeTasks, setActiveTasks] = useState<BackgroundTask[]>([]);
  const { toast } = useToast();

  // 使用 ref 追踪轮询状态，避免 effect 依赖问题
  const hasActiveTasksRef = useRef(false);
  const isPollingRef = useRef(false);

  // 加载统计信息
  const loadStats = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const data = await searchIndexApi.getSessionStats(sessionId, signal);
      if (!signal?.aborted) {
        setStats(data);
      }
    } catch (error: any) {
      // 忽略取消的请求
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || signal?.aborted) {
        return;
      }
      console.error('Failed to load search index stats:', error);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  // 加载任务列表
  const loadTasks = useCallback(async (signal?: AbortSignal): Promise<BackgroundTask[]> => {
    try {
      const response = await backgroundTaskApi.getSessionTasks(sessionId, undefined, signal);
      if (signal?.aborted) {
        return [];
      }
      // 只显示活跃的任务（pending 或 running）
      const active = response.tasks.filter(t => t.status === 'pending' || t.status === 'running');
      setActiveTasks(active);
      hasActiveTasksRef.current = active.length > 0;
      return active;
    } catch (error: any) {
      // 忽略取消的请求
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || signal?.aborted) {
        return [];
      }
      console.error('Failed to load tasks:', error);
      return [];
    }
  }, [sessionId]);

  // 初始加载和定期轮询（合并为一个 effect）
  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    // 初始加载
    const initialLoad = async () => {
      await Promise.all([
        loadStats(signal),
        loadTasks(signal),
      ]);
    };
    
    initialLoad();
    
    // 设置轮询（检查是否有活跃任务）
    const startPolling = () => {
      if (intervalId || isPollingRef.current) return;
      isPollingRef.current = true;
      
      intervalId = setInterval(async () => {
        if (signal.aborted) return;
        
        // 只在有活跃任务时轮询
        if (!hasActiveTasksRef.current) {
          return;
        }
        
        const prevCount = hasActiveTasksRef.current ? 1 : 0; // 简化：只检查是否有任务
        const newTasks = await loadTasks(signal);
        
        // 如果任务完成了，刷新统计
        if (newTasks.length === 0 && prevCount > 0) {
          await loadStats(signal);
        }
      }, 3000);
    };
    
    startPolling();
    
    return () => {
      abortController.abort();
      if (intervalId) {
        clearInterval(intervalId);
      }
      isPollingRef.current = false;
    };
  }, [sessionId, loadStats, loadTasks]);

  const handleReindex = async () => {
    setShowReindexDialog(false);
    try {
      const result = await backgroundTaskApi.startReindexTask(sessionId, skipEmbedding);
      toast({
        title: '任务已创建',
        description: result.message,
      });
      await loadTasks();
    } catch (error: any) {
      toast({
        title: '创建任务失败',
        description: error.response?.data?.detail || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const handleBackfill = async () => {
    setShowBackfillDialog(false);
    try {
      const result = await backgroundTaskApi.startBackfillTask(sessionId, 100);
      toast({
        title: '任务已创建',
        description: result.message,
      });
      await loadTasks();
    } catch (error: any) {
      toast({
        title: '创建任务失败',
        description: error.response?.data?.detail || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      const result = await backgroundTaskApi.cancelTask(taskId);
      toast({
        title: result.success ? '任务已取消' : '取消失败',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      await loadTasks();
    } catch (error: any) {
      toast({
        title: '取消失败',
        description: error.response?.data?.detail || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const getTaskTypeLabel = (taskType: string) => {
    switch (taskType) {
      case 'index_session':
        return '建立索引';
      case 'reindex_session':
        return '重建索引';
      case 'backfill_embeddings':
        return '补建向量';
      default:
        return taskType;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3" />;
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      case 'cancelled':
        return <StopCircle className="h-3 w-3" />;
      default:
        return null;
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
  
  const hasActiveTasks = activeTasks.length > 0;

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
          {/* 活跃任务 */}
          {hasActiveTasks && (
            <>
              <div className="space-y-2">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-md"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <span className="text-sm font-medium">
                          {getTaskTypeLabel(task.task_type)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {task.status === 'running' ? '执行中' : '等待中'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={task.progress_percent} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground">
                          {task.processed_items}/{task.total_items}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelTask(task.id)}
                      className="ml-2"
                    >
                      取消
                    </Button>
                  </div>
                ))}
              </div>
              <Separator />
            </>
          )}

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
                  为未索引的消息创建搜索索引（后台执行）
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReindexDialog(true)}
                disabled={hasActiveTasks || stats.total_messages === stats.indexed_messages}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                重建
              </Button>
            </div>

            {/* 补建 Embedding */}
            {stats.no_embedding > 0 && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">补建向量索引</p>
                  <p className="text-xs text-muted-foreground">
                    为仅有文本索引的消息生成向量（后台执行）
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBackfillDialog(true)}
                  disabled={hasActiveTasks}
                >
                  <Zap className="h-4 w-4 mr-2" />
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
              但会产生 API 调用费用。索引任务在后台执行，不会阻塞其他操作。
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
                  任务将在后台执行。
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
              这将启用语义搜索功能，但会产生 Embedding API 调用费用。任务将在后台执行。
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
