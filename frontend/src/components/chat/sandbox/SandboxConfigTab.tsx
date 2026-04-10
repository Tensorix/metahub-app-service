/**
 * SandboxConfigTab - persistent per-session sandbox config + start/stop control.
 */

import { useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { sandboxApi, type SandboxMount } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Pause, Play, Plus, RefreshCw, RotateCcw, Save, Square, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SandboxConfigTabProps {
  sessionId: string;
}

const DEFAULT_TIMEOUT = 600;
const EMPTY_MOUNT: SandboxMount = {
  host_path: '',
  mount_path: '/workspace',
  read_only: false,
  sub_path: '',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function normalizeMount(mount: SandboxMount): SandboxMount {
  return {
    host_path: mount.host_path.trim(),
    mount_path: mount.mount_path.trim(),
    read_only: Boolean(mount.read_only),
    sub_path: mount.sub_path?.trim() || undefined,
  };
}

function serializeMounts(mounts: SandboxMount[]): string {
  return JSON.stringify(mounts.map(normalizeMount));
}

export function SandboxConfigTab({ sessionId }: SandboxConfigTabProps) {
  const { toast } = useToast();
  const sandboxStatus = useChatStore((s) => s.sandboxStatus);
  const sandboxLoading = useChatStore((s) => s.sandboxLoading);
  const updateSandboxConfig = useChatStore((s) => s.updateSandboxConfig);
  const createSandbox = useChatStore((s) => s.createSandbox);
  const pauseSandbox = useChatStore((s) => s.pauseSandbox);
  const resumeSandbox = useChatStore((s) => s.resumeSandbox);
  const stopSandbox = useChatStore((s) => s.stopSandbox);

  const current = sandboxStatus[sessionId] ?? null;
  const loading = sandboxLoading[sessionId] ?? false;
  const currentHasTimeout = current?.timeout != null;

  const status = current?.status ?? 'stopped';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isTransient = status === 'creating' || status === 'stopping';
  const editsLocked = isRunning || isPaused || isTransient;
  const canRenew = currentHasTimeout;

  const [imageDraft, setImageDraft] = useState<string>(current?.image ?? '');
  const [timeoutEnabled, setTimeoutEnabled] = useState<boolean>(currentHasTimeout);
  const [timeoutDraft, setTimeoutDraft] = useState<string>(
    current?.timeout != null ? String(current.timeout) : '',
  );
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>(current?.env ?? {});
  const [mountDrafts, setMountDrafts] = useState<SandboxMount[]>(current?.mounts ?? []);
  const [renewing, setRenewing] = useState(false);

  // Sync drafts when the underlying record changes (e.g. status update)
  useEffect(() => {
    setImageDraft(current?.image ?? '');
    setTimeoutEnabled(currentHasTimeout);
    setTimeoutDraft(current?.timeout != null ? String(current.timeout) : '');
    setEnvDrafts(current?.env ?? {});
    setMountDrafts(current?.mounts ?? []);
  }, [current?.image, current?.env, current?.mounts, current?.timeout, currentHasTimeout]);

  const hasDrafts = useMemo(() => {
    const cleanImage = imageDraft.trim();
    const cleanTimeout = timeoutDraft.trim();
    const recordedImage = current?.image ?? '';
    const recordedTimeout =
      current?.timeout != null ? String(current.timeout) : '';
    const recordedEnv = JSON.stringify(current?.env ?? {});
    const draftEnv = JSON.stringify(envDrafts);
    const recordedMounts = serializeMounts(current?.mounts ?? []);
    const draftMounts = serializeMounts(mountDrafts);
    return (
      cleanImage !== recordedImage ||
      timeoutEnabled !== currentHasTimeout ||
      (timeoutEnabled && cleanTimeout !== recordedTimeout) ||
      recordedEnv !== draftEnv ||
      recordedMounts !== draftMounts
    );
  }, [current, currentHasTimeout, envDrafts, imageDraft, mountDrafts, timeoutDraft, timeoutEnabled]);

  const buildPayload = () => {
    const image = imageDraft.trim();
    const timeout = timeoutDraft.trim();
    const payload: {
      image?: string;
      timeout: number | null;
      env: Record<string, string>;
      mounts: SandboxMount[];
    } = {
      timeout: null,
      env: Object.fromEntries(
        Object.entries(envDrafts).filter(([k, v]) => k.trim() && v.trim()),
      ),
      mounts: mountDrafts.map(normalizeMount).filter((mount) => {
        if (!mount.host_path && !mount.mount_path && !mount.sub_path) {
          return false;
        }
        if (!mount.host_path) {
          throw new Error('Host path is required for each mount');
        }
        if (!mount.mount_path) {
          throw new Error('Mount path is required for each mount');
        }
        return true;
      }),
    };
    if (image) payload.image = image;
    if (timeoutEnabled) {
      if (!timeout) {
        throw new Error('Timeout is required when enabled');
      }
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

  const handlePause = async () => {
    try {
      await pauseSandbox(sessionId);
      toast({ title: '沙箱已暂停' });
    } catch (err: any) {
      toast({
        title: '暂停沙箱失败',
        description: err?.response?.data?.detail || err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleResume = async () => {
    try {
      await resumeSandbox(sessionId);
      toast({ title: '沙箱已恢复' });
    } catch (err: any) {
      toast({
        title: '恢复沙箱失败',
        description: err?.response?.data?.detail || err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleRenew = async () => {
    if (!canRenew) {
      toast({ title: '当前沙箱不会自动过期，无需续期' });
      return;
    }
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
        description: err?.response?.data?.detail || err?.message || String(err),
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
                  : isPaused
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
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
          {current && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Timeout</span>
              <span>{currentHasTimeout ? `${current.timeout}s` : 'Never expires'}</span>
            </div>
          )}
          {current && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{currentHasTimeout ? formatDate(current.expires_at) : 'Never expires'}</span>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="sandbox-timeout" className="text-xs">
                Timeout (seconds)
              </Label>
              <Switch
                checked={timeoutEnabled}
                onCheckedChange={setTimeoutEnabled}
                disabled={editsLocked}
              />
            </div>
            {timeoutEnabled && (
              <Input
                id="sandbox-timeout"
                type="number"
                min={1}
                value={timeoutDraft}
                onChange={(e) => setTimeoutDraft(e.target.value)}
                placeholder="e.g. 600"
                disabled={editsLocked}
                className="h-8 text-sm"
              />
            )}
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
            {editsLocked && (
              <span className="text-xs text-muted-foreground">
                Stop the sandbox to change image, timeout, env, or mounts.
              </span>
            )}
          </div>
        </div>

        {/* Environment Variables */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Environment Variables</div>
              <div className="text-xs text-muted-foreground">
                Key-value pairs passed to the sandbox.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setEnvDrafts((prev) => ({ ...prev, '': '' }))
              }
              disabled={editsLocked || '' in envDrafts}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add
            </Button>
          </div>

          {Object.keys(envDrafts).length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No environment variables configured.
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(envDrafts).map(([key, value], index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={key}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setEnvDrafts((prev) => {
                        const entries = Object.entries(prev);
                        const idx = entries.findIndex(([k]) => k === key);
                        if (idx === -1) return prev;
                        entries[idx] = [newKey, value];
                        return Object.fromEntries(entries);
                      });
                    }}
                    placeholder="KEY"
                    disabled={editsLocked}
                    className="h-8 text-sm font-mono flex-1"
                  />
                  <Input
                    value={value}
                    onChange={(e) =>
                      setEnvDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    placeholder="value"
                    disabled={editsLocked}
                    className="h-8 text-sm font-mono flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      setEnvDrafts((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })
                    }
                    disabled={editsLocked}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Host Mounts</div>
              <div className="text-xs text-muted-foreground">
                Absolute host path to sandbox mount path.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMountDrafts((prev) => [...prev, { ...EMPTY_MOUNT }])}
              disabled={editsLocked}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add
            </Button>
          </div>

          {mountDrafts.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No host mounts configured.
            </div>
          ) : (
            <div className="space-y-3">
              {mountDrafts.map((mount, index) => (
                <div key={index} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Mount #{index + 1}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() =>
                        setMountDrafts((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={editsLocked}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Host Path</Label>
                    <Input
                      value={mount.host_path}
                      onChange={(e) =>
                        setMountDrafts((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, host_path: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="/absolute/path/on/host"
                      disabled={editsLocked}
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Mount Path</Label>
                    <Input
                      value={mount.mount_path}
                      onChange={(e) =>
                        setMountDrafts((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, mount_path: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="/workspace/data"
                      disabled={editsLocked}
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Sub Path</Label>
                    <Input
                      value={mount.sub_path ?? ''}
                      onChange={(e) =>
                        setMountDrafts((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, sub_path: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="optional/sub/dir"
                      disabled={editsLocked}
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <div className="text-xs font-medium">Read only</div>
                      <div className="text-[11px] text-muted-foreground">
                        Prevent writes to the mounted host path.
                      </div>
                    </div>
                    <Switch
                      checked={mount.read_only}
                      onCheckedChange={(checked) =>
                        setMountDrafts((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, read_only: checked } : item,
                          ),
                        )
                      }
                      disabled={editsLocked}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lifecycle controls */}
        <div className="flex flex-col gap-2 pt-2 border-t">
          {isRunning ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePause}
                disabled={loading || isTransient}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-1.5" />
                )}
                Pause Sandbox
              </Button>
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
                disabled={renewing || loading || !canRenew}
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
          ) : isPaused ? (
            <>
              <Button
                size="sm"
                onClick={handleResume}
                disabled={loading || isTransient}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                )}
                Resume Sandbox
              </Button>
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
