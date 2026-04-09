/**
 * SandboxConfigTab - persistent per-session sandbox config + start/stop control.
 */

import { useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { sandboxApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, Save, Square, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SandboxConfigTabProps {
  sessionId: string;
}

const DEFAULT_TIMEOUT = 600;

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function SandboxConfigTab({ sessionId }: SandboxConfigTabProps) {
  const { toast } = useToast();
  const sandboxStatus = useChatStore((s) => s.sandboxStatus);
  const sandboxLoading = useChatStore((s) => s.sandboxLoading);
  const updateSandboxConfig = useChatStore((s) => s.updateSandboxConfig);
  const createSandbox = useChatStore((s) => s.createSandbox);
  const stopSandbox = useChatStore((s) => s.stopSandbox);

  const current = sandboxStatus[sessionId] ?? null;
  const loading = sandboxLoading[sessionId] ?? false;

  const status = current?.status ?? 'stopped';
  const isRunning = status === 'running';
  const isTransient = status === 'creating' || status === 'stopping';
  const editsLocked = isRunning || isTransient;

  const [imageDraft, setImageDraft] = useState<string>(current?.image ?? '');
  const [timeoutDraft, setTimeoutDraft] = useState<string>(
    current?.timeout != null ? String(current.timeout) : '',
  );
  const [renewing, setRenewing] = useState(false);

  // Sync drafts when the underlying record changes (e.g. status update)
  useEffect(() => {
    setImageDraft(current?.image ?? '');
    setTimeoutDraft(current?.timeout != null ? String(current.timeout) : '');
  }, [current?.image, current?.timeout]);

  const hasDrafts = useMemo(() => {
    const cleanImage = imageDraft.trim();
    const cleanTimeout = timeoutDraft.trim();
    const recordedImage = current?.image ?? '';
    const recordedTimeout = current?.timeout != null ? String(current.timeout) : '';
    return cleanImage !== recordedImage || cleanTimeout !== recordedTimeout;
  }, [imageDraft, timeoutDraft, current]);

  const buildPayload = () => {
    const image = imageDraft.trim();
    const timeout = timeoutDraft.trim();
    const payload: { image?: string; timeout?: number } = {};
    if (image) payload.image = image;
    if (timeout) {
      const n = Number(timeout);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('Timeout must be a positive number');
      }
      payload.timeout = Math.floor(n);
    }
    return payload;
  };

  const handleSave = async () => {
    try {
      const payload = buildPayload();
      await updateSandboxConfig(sessionId, payload);
      toast({ title: '配置已保存' });
    } catch (err: any) {
      toast({
        title: '保存失败',
        description: err?.response?.data?.detail || err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleStart = async () => {
    try {
      const payload = buildPayload();
      if (hasDrafts) {
        await updateSandboxConfig(sessionId, payload);
      }
      await createSandbox(sessionId, payload);
      toast({ title: '沙箱已启动', description: '代码执行环境已就绪' });
    } catch (err: any) {
      toast({
        title: '启动沙箱失败',
        description: err?.response?.data?.detail || err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleStop = async () => {
    try {
      await stopSandbox(sessionId);
      toast({ title: '沙箱已停止' });
    } catch (err: any) {
      toast({
        title: '停止沙箱失败',
        description: err?.response?.data?.detail || err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleRenew = async () => {
    setRenewing(true);
    try {
      const duration =
        (current?.timeout != null && current.timeout > 0
          ? current.timeout
          : DEFAULT_TIMEOUT);
      const info = await sandboxApi.renew(sessionId, duration);
      await useChatStore.getState().loadSandboxStatus(sessionId);
      toast({
        title: '沙箱已续期',
        description: info?.expires_at
          ? `到期时间已重置为 ${formatDate(info.expires_at)}`
          : `到期时间已重置为当前时间起 ${duration} 秒后`,
      });
    } catch (err: any) {
      toast({
        title: '续期失败',
        description: err?.response?.data?.detail || String(err),
        variant: 'destructive',
      });
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Status card */}
        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded-md font-medium',
                isRunning
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : status === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {status}
            </span>
          </div>
          {current?.sandbox_id && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Sandbox ID</span>
              <span className="font-mono truncate max-w-[60%]" title={current.sandbox_id}>
                {current.sandbox_id}
              </span>
            </div>
          )}
          {current?.created_at && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(current.created_at)}</span>
            </div>
          )}
          {current?.expires_at && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{formatDate(current.expires_at)}</span>
            </div>
          )}
          {current?.error_message && (
            <div className="mt-1 pt-1.5 border-t border-border/50 text-destructive">
              {current.error_message}
            </div>
          )}
        </div>

        {/* Editable config */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sandbox-image" className="text-xs">
              Image
            </Label>
            <Input
              id="sandbox-image"
              type="text"
              value={imageDraft}
              onChange={(e) => setImageDraft(e.target.value)}
              placeholder="e.g. python:3.12 (leave empty for global default)"
              disabled={editsLocked}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sandbox-timeout" className="text-xs">
              Timeout (seconds)
            </Label>
            <Input
              id="sandbox-timeout"
              type="number"
              min={1}
              value={timeoutDraft}
              onChange={(e) => setTimeoutDraft(e.target.value)}
              placeholder="e.g. 600 (leave empty for global default)"
              disabled={editsLocked}
              className="h-8 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSave}
              disabled={editsLocked || loading || !hasDrafts}
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
            {editsLocked && !isRunning && (
              <span className="text-xs text-muted-foreground">
                Cannot edit while sandbox is {status}.
              </span>
            )}
          </div>
        </div>

        {/* Lifecycle controls */}
        <div className="flex flex-col gap-2 pt-2 border-t">
          {isRunning ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStop}
                disabled={loading || isTransient}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-1.5" />
                )}
                Stop Sandbox
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRenew}
                disabled={renewing || loading}
                className="w-full"
              >
                {renewing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                )}
                Renew
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={loading || isTransient}
              className="w-full"
            >
              {loading || status === 'creating' ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1.5" />
              )}
              Start Sandbox
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
