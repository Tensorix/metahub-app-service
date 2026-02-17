import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ScheduledTask,
  ScheduledTaskCreate,
  ScheduledTaskUpdate,
} from '@/lib/scheduledTaskApi';

interface ScheduledTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: ScheduledTask | null;
  onSubmit: (data: ScheduledTaskCreate | ScheduledTaskUpdate) => Promise<void>;
}

const SCHEDULE_TYPES = [
  { value: 'cron', label: 'Cron 表达式' },
  { value: 'interval', label: '固定间隔' },
  { value: 'one_shot', label: '一次性' },
] as const;

const INTERVAL_UNITS = [
  { value: 'seconds', label: '秒' },
  { value: 'minutes', label: '分钟' },
  { value: 'hours', label: '小时' },
  { value: 'days', label: '天' },
] as const;

const TASK_TYPES = [
  { value: 'system_cleanup', label: '系统清理' },
  { value: 'health_check', label: '健康检查' },
  { value: 'send_message', label: '发送消息' },
  { value: 'run_agent', label: '执行 Agent' },
  { value: 'call_tool', label: '调用工具' },
  { value: 'custom', label: '自定义' },
] as const;

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (中国)' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
];

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(v: string): string {
  if (!v) return '';
  return new Date(v).toISOString();
}

export function ScheduledTaskDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
}: ScheduledTaskDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    schedule_type: 'cron' | 'interval' | 'one_shot';
    schedule_config: Record<string, unknown>;
    timezone: string;
    task_type: string;
    task_params_str: string;
    max_runs: string;
  }>({
    name: '',
    description: '',
    schedule_type: 'cron',
    schedule_config: { hour: 2, minute: 0 },
    timezone: 'UTC',
    task_type: 'system_cleanup',
    task_params_str: '{}',
    max_runs: '',
  });
  const [loading, setLoading] = useState(false);
  const [paramsError, setParamsError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        description: task.description || '',
        schedule_type: task.schedule_type,
        schedule_config: { ...task.schedule_config },
        timezone: task.timezone,
        task_type: task.task_type,
        task_params_str:
          typeof task.task_params === 'object' && task.task_params !== null
            ? JSON.stringify(task.task_params, null, 2)
            : '{}',
        max_runs: task.max_runs != null ? String(task.max_runs) : '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        schedule_type: 'cron',
        schedule_config: { hour: 2, minute: 0 },
        timezone: 'UTC',
        task_type: 'system_cleanup',
        task_params_str: '{}',
        max_runs: '',
      });
    }
    setParamsError(null);
  }, [task, open]);

  const parseTaskParams = (): Record<string, unknown> | null => {
    const s = formData.task_params_str.trim();
    if (!s) return {};
    try {
      const parsed = JSON.parse(s);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setParamsError(null);

    const taskParams = parseTaskParams();
    if (taskParams === null) {
      setParamsError('任务参数必须是有效的 JSON');
      return;
    }

    const scheduleConfig: Record<string, unknown> = { ...formData.schedule_config };
    if (formData.schedule_type === 'one_shot') {
      const runAt = scheduleConfig.run_at as string | undefined;
      if (!runAt || !runAt.trim()) {
        setParamsError('一次性任务必须指定执行时间');
        return;
      }
    } else if (formData.schedule_type === 'interval') {
      const unit = (scheduleConfig.unit as string) || 'minutes';
      const value = Number(scheduleConfig.value) || 1;
      delete scheduleConfig.unit;
      delete scheduleConfig.value;
      scheduleConfig[unit] = value;
    } else if (formData.schedule_type === 'cron') {
      scheduleConfig.hour = Number(scheduleConfig.hour) ?? 2;
      scheduleConfig.minute = Number(scheduleConfig.minute) ?? 0;
    }

    const payload: ScheduledTaskCreate | ScheduledTaskUpdate = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      schedule_type: formData.schedule_type,
      schedule_config: scheduleConfig,
      timezone: formData.timezone,
      task_type: formData.task_type,
      task_params: taskParams,
      max_runs:
        formData.max_runs.trim() !== ''
          ? Math.max(1, parseInt(formData.max_runs, 10) || 1)
          : undefined,
    };

    setLoading(true);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      // 由调用方显示 toast
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const scheduleConfigForCron = () => {
    const cfg = formData.schedule_config as { hour?: number; minute?: number };
    return {
      hour: cfg.hour ?? 2,
      minute: cfg.minute ?? 0,
    };
  };

  const scheduleConfigForInterval = () => {
    const cfg = formData.schedule_config as {
      value?: number;
      unit?: string;
    };
    return {
      value: cfg.value ?? 30,
      unit: cfg.unit ?? 'minutes',
    };
  };

  const scheduleConfigForOneShot = () => {
    const cfg = formData.schedule_config as { run_at?: string };
    return {
      run_at: cfg.run_at ?? '',
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? '编辑定时任务' : '创建定时任务'}</DialogTitle>
          <DialogDescription>
            {task
              ? '修改调度配置或任务参数'
              : '创建新的定时任务，支持 Cron、固定间隔和一次性执行'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基础信息 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">任务名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="例如：每日清理"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">任务描述（可选）</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="简述任务用途"
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* 调度配置 */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">调度配置</h4>
            <div className="space-y-2">
              <Label>调度类型</Label>
              <Select
                value={formData.schedule_type}
                onValueChange={(v: 'cron' | 'interval' | 'one_shot') =>
                  setFormData({
                    ...formData,
                    schedule_type: v,
                    schedule_config:
                      v === 'interval'
                        ? { value: 30, unit: 'minutes' }
                        : v === 'one_shot'
                          ? { run_at: '' }
                          : { hour: 2, minute: 0 },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.schedule_type === 'cron' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>小时 (0-23)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={scheduleConfigForCron().hour}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        schedule_config: {
                          ...formData.schedule_config,
                          hour: parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>分钟 (0-59)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={scheduleConfigForCron().minute}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        schedule_config: {
                          ...formData.schedule_config,
                          minute: parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}

            {formData.schedule_type === 'interval' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>间隔数值</Label>
                  <Input
                    type="number"
                    min={1}
                    value={scheduleConfigForInterval().value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        schedule_config: {
                          ...formData.schedule_config,
                          value: parseInt(e.target.value, 10) || 1,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>单位</Label>
                  <Select
                    value={scheduleConfigForInterval().unit}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        schedule_config: {
                          ...formData.schedule_config,
                          unit: v,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.schedule_type === 'one_shot' && (
              <div className="space-y-2">
                <Label>执行时间</Label>
                <Input
                  type="datetime-local"
                  value={
                    scheduleConfigForOneShot().run_at
                      ? toDatetimeLocal(scheduleConfigForOneShot().run_at)
                      : ''
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      schedule_config: {
                        run_at: fromDatetimeLocal(e.target.value),
                      },
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>时区</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) =>
                  setFormData({ ...formData, timezone: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 任务配置 */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">任务配置</h4>
            <div className="space-y-2">
              <Label>任务类型</Label>
              <Select
                value={formData.task_type}
                onValueChange={(v) =>
                  setFormData({ ...formData, task_type: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>任务参数（JSON）</Label>
              <Textarea
                value={formData.task_params_str}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    task_params_str: e.target.value,
                  });
                  setParamsError(null);
                }}
                placeholder='{"key": "value"}'
                rows={4}
                className="font-mono text-sm"
              />
              {paramsError && (
                <p className="text-sm text-destructive">{paramsError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_runs">最大执行次数（可选，留空为无限）</Label>
              <Input
                id="max_runs"
                type="number"
                min={1}
                value={formData.max_runs}
                onChange={(e) =>
                  setFormData({ ...formData, max_runs: e.target.value })
                }
                placeholder="留空为无限"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '提交中...' : task ? '更新' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
