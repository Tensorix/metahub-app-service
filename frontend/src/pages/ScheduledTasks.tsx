import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Pause,
  RotateCw,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScheduledTaskDialog } from '@/components/ScheduledTaskDialog';
import { DeleteScheduledTaskDialog } from '@/components/DeleteScheduledTaskDialog';
import {
  scheduledTaskApi,
  describeSchedule,
} from '@/lib/scheduledTaskApi';
import type {
  ScheduledTask,
  ScheduledTaskCreate,
  ScheduledTaskUpdate,
} from '@/lib/scheduledTaskApi';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '运行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'expired', label: '已过期' },
];

const TASK_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'system_cleanup', label: '系统清理' },
  { value: 'health_check', label: '健康检查' },
  { value: 'send_message', label: '发送消息' },
  { value: 'run_agent', label: '执行 Agent' },
  { value: 'call_tool', label: '调用工具' },
  { value: 'custom', label: '自定义' },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    active: 'default',
    paused: 'secondary',
    completed: 'outline',
    expired: 'destructive',
  };
  const labels: Record<string, string> = {
    active: '运行中',
    paused: '已暂停',
    completed: '已完成',
    expired: '已过期',
  };
  return (
    <Badge variant={variants[status] ?? 'outline'}>
      {labels[status] ?? status}
    </Badge>
  );
}

export default function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await scheduledTaskApi.listTasks({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        task_type: taskTypeFilter !== 'all' ? taskTypeFilter : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setTasks(res.tasks);
      setTotal(res.total);
    } catch (error) {
      console.error('Failed to load scheduled tasks:', error);
      setTasks([]);
      setTotal(0);
      toast({
        title: '加载失败',
        description: '无法加载定时任务列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, taskTypeFilter, offset, toast]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreate = async (data: ScheduledTaskCreate | ScheduledTaskUpdate) => {
    await scheduledTaskApi.createTask(data as ScheduledTaskCreate);
    toast({ title: '创建成功', description: '定时任务已创建' });
    loadTasks();
  };

  const handleUpdate = async (data: ScheduledTaskCreate | ScheduledTaskUpdate) => {
    if (!editingTask) return;
    await scheduledTaskApi.updateTask(editingTask.id, data as ScheduledTaskUpdate);
    toast({ title: '更新成功', description: '定时任务已更新' });
    loadTasks();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await scheduledTaskApi.deleteTask(deleteTarget.id);
      toast({ title: '删除成功', description: '定时任务已删除' });
      loadTasks();
    } catch {
      toast({
        title: '删除失败',
        description: '无法删除定时任务',
        variant: 'destructive',
      });
    }
    setDeleteTarget(null);
  };

  const handlePause = async (task: ScheduledTask) => {
    try {
      await scheduledTaskApi.pauseTask(task.id);
      toast({ title: '已暂停', description: `「${task.name}」已暂停` });
      loadTasks();
    } catch {
      toast({
        title: '操作失败',
        description: '无法暂停任务',
        variant: 'destructive',
      });
    }
  };

  const handleResume = async (task: ScheduledTask) => {
    try {
      await scheduledTaskApi.resumeTask(task.id);
      toast({ title: '已恢复', description: `「${task.name}」已恢复运行` });
      loadTasks();
    } catch {
      toast({
        title: '操作失败',
        description: '无法恢复任务',
        variant: 'destructive',
      });
    }
  };

  const handleTrigger = async (task: ScheduledTask) => {
    setTriggeringId(task.id);
    try {
      await scheduledTaskApi.triggerTask(task.id);
      toast({ title: '已触发', description: `「${task.name}」已手动执行` });
      loadTasks();
    } catch {
      toast({
        title: '触发失败',
        description: '无法手动触发任务',
        variant: 'destructive',
      });
    } finally {
      setTriggeringId(null);
    }
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const openEditDialog = (task: ScheduledTask) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">定时任务</h1>
          <p className="text-muted-foreground mt-1">
            管理 Cron、固定间隔和一次性定时任务
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          创建任务
        </Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={taskTypeFilter} onValueChange={(v) => { setTaskTypeFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="任务类型" />
          </SelectTrigger>
          <SelectContent>
            {TASK_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <Clock className="h-16 w-16 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">暂无定时任务</h3>
              <p className="text-muted-foreground mt-1">
                创建你的第一个定时任务，支持 Cron、固定间隔和一次性执行
              </p>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              创建任务
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <Card key={task.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        <Clock className="h-5 w-5 shrink-0" />
                        <span className="truncate">{task.name}</span>
                      </CardTitle>
                      <CardDescription className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge status={task.status} />
                        <Badge variant="outline">
                          {describeSchedule(task.schedule_type, task.schedule_config)}
                        </Badge>
                        <Badge variant="secondary">{task.task_type}</Badge>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {task.description && (
                      <p className="text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="text-muted-foreground">
                      <span>执行次数: {task.run_count}</span>
                      {task.last_run_at && (
                        <>
                          <span> · </span>
                          <span>
                            上次: {formatDateTime(task.last_run_at)}
                            {task.last_run_status && (
                              <Badge
                                variant={
                                  task.last_run_status === 'success'
                                    ? 'secondary'
                                    : 'destructive'
                                }
                                className="ml-1 text-xs"
                              >
                                {task.last_run_status === 'success' ? '成功' : '失败'}
                              </Badge>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {task.next_run_at && task.status === 'active' && (
                      <p className="text-muted-foreground">
                        下次执行: {formatDateTime(task.next_run_at)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(task)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        编辑
                      </Button>
                      {task.status === 'active' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePause(task)}
                          >
                            <Pause className="mr-1 h-3 w-3" />
                            暂停
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTrigger(task)}
                            disabled={!!triggeringId}
                          >
                            <Zap className="mr-1 h-3 w-3" />
                            触发
                          </Button>
                        </>
                      )}
                      {task.status === 'paused' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResume(task)}
                        >
                          <RotateCw className="mr-1 h-3 w-3" />
                          恢复
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(task)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {currentPage} 页，共 {totalPages} 页
              </span>
              <Button
                variant="outline"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}

      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        onSubmit={editingTask ? handleUpdate : handleCreate}
      />

      {deleteTarget && (
        <DeleteScheduledTaskDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          task={deleteTarget}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
