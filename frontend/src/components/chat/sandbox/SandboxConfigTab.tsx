/**
 * SandboxConfigTab - persistent per-session sandbox config + start/stop control.
 *
 * Layout hierarchy:
 *   1. Lifecycle controls (primary action) + status summary
 *   2. Configuration (image, timeout)
 *   3. Environment Variables (collapsible)
 *   4. Host Mounts (collapsible)
 */

import { useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { sandboxApi, type SandboxMount } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronDown,
  HardDrive,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Square,
  Terminal,
  Trash2,
  Variable,
} from 'lucide-react';
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

/* ── Collapsible section header ───────────────────────────── */

function SectionHeader({
  icon: Icon,
  title,
  count,
  open,
  onToggle,
  action,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-2 text-left group cursor-pointer"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium flex-1">{title}</span>
      {count != null && count > 0 && (
        <span className="text-[10px] font-medium tabular-nums bg-muted text-muted-foreground rounded px-1.5 py-0.5">
          {count}
        </span>
      )}
      {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
          open && 'rotate-180',
        )}
      />
    </button>
  );
}

/* ── Main component ───────────────────────────────────────── */

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

  /* Draft state */
  const [imageDraft, setImageDraft] = useState<string>(current?.image ?? '');
  const [timeoutEnabled, setTimeoutEnabled] = useState<boolean>(currentHasTimeout);
  const [timeoutDraft, setTimeoutDraft] = useState<string>(
    current?.timeout != null ? String(current.timeout) : '',
  );
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>(current?.env ?? {});
  const [mountDrafts, setMountDrafts] = useState<SandboxMount[]>(current?.mounts ?? []);
  const [renewing, setRenewing] = useState(false);

  /* Collapsible section state */
  const [envOpen, setEnvOpen] = useState(false);
  const [mountsOpen, setMountsOpen] = useState(false);

  // Auto-expand sections when they have data
  useEffect(() => {
    if (Object.keys(current?.env ?? {}).length > 0) setEnvOpen(true);
    if ((current?.mounts ?? []).length > 0) setMountsOpen(true);
  }, [current?.env, current?.mounts]);

  // Sync drafts when the underlying record changes
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
    const recordedTimeout = current?.timeout != null ? String(current.timeout) : '';
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
        if (!mount.host_path && !mount.mount_path && !mount.sub_path) return false;
        if (!mount.host_path) throw new Error('Host path is required for each mount');
        if (!mount.mount_path) throw new Error('Mount path is required for each mount');
        return true;
      }),
    };
    if (image) payload.image = image;
    if (timeoutEnabled) {
      if (!timeout) throw new Error('Timeout is required when enabled');
      const n = Number(timeout);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Timeout must be a positive number');
      payload.timeout = Math.floor(n);
    }
    return payload;
  };

  /* ── Handlers ─────────────────────────────────────────── */

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
      if (hasDrafts) await updateSandboxConfig(sessionId, payload);
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
        current?.timeout != null && current.timeout > 0 ? current.timeout : DEFAULT_TIMEOUT;
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

  const envCount = Object.keys(envDrafts).length;
  const mountCount = mountDrafts.length;

  /* ── Render ───────────────────────────────────────────── */

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-3">

        {/* ─── Section 1: Lifecycle & Status ─── */}
        <div
          className={cn(
            'group relative overflow-hidden rounded-xl border bg-card transition-all duration-200',
            isRunning
              ? 'border-green-500/20 bg-green-500/[0.02] dark:bg-green-500/[0.05] shadow-[0_2px_10px_-3px_rgba(34,197,94,0.1)]'
              : isPaused
                ? 'border-amber-500/20 bg-amber-500/[0.02] dark:bg-amber-500/[0.05] shadow-[0_2px_10px_-3px_rgba(245,158,11,0.1)]'
                : 'hover:border-primary/20 hover:shadow-sm shadow-sm',
          )}
        >
          <div className="p-4">
            {/* Header and Actions Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-sm',
                      isRunning
                        ? 'border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-500'
                        : isPaused
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-500'
                          : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="text-sm font-semibold tracking-tight">Execution Sandbox</h3>
                  {/* Status Badge */}
                  {status !== 'stopped' && status !== 'creating' && (
                    <span
                      className={cn(
                        'ml-1 inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                        isRunning
                          ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                          : isPaused
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                            : status === 'error'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {status}
                    </span>
                  )}
                  {(status === 'stopped' || status === 'creating') && (
                    <span className="ml-1 inline-flex shrink-0 items-center justify-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {status}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed sm:pl-9">
                  {isRunning
                    ? 'Environment is running and ready for code execution.'
                    : isPaused
                      ? 'Environment is currently paused to save resources.'
                      : 'Secure isolated container for safe code execution.'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2 sm:pl-0 pl-9">
                {isRunning ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePause}
                      disabled={loading || isTransient}
                      className="h-8 shadow-xs hover:bg-muted font-medium rounded-full px-3.5"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Pause className="h-3.5 w-3.5 mr-1.5 text-amber-500 fill-amber-500" />
                      )}
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStop}
                      disabled={loading || isTransient}
                      className="h-8 shadow-xs hover:bg-destructive/10 hover:text-destructive font-medium border-destructive/20 rounded-full px-3.5"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-destructive/70" />
                      ) : (
                        <Square className="h-3.5 w-3.5 mr-1.5 text-destructive fill-destructive" />
                      )}
                      Stop
                    </Button>
                    {canRenew && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={handleRenew}
                              disabled={renewing || loading}
                              className="h-8 w-8 rounded-full shrink-0 shadow-xs"
                            >
                              {renewing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Renew timeout</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </>
                ) : isPaused ? (
                  <>
                    <Button
                      size="sm"
                      onClick={handleResume}
                      disabled={loading || isTransient}
                      className="h-8 font-medium shadow-sm rounded-full px-3.5"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStop}
                      disabled={loading || isTransient}
                      className="h-8 shadow-xs hover:bg-destructive/10 hover:text-destructive font-medium border-destructive/20 rounded-full px-3.5"
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-destructive/70" />
                      ) : (
                        <Square className="h-3.5 w-3.5 mr-1.5 text-destructive fill-destructive" />
                      )}
                      Stop
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={loading || isTransient}
                    className="h-8 bg-primary/95 hover:bg-primary text-primary-foreground font-medium shadow-sm transition-all rounded-full px-5 hover:scale-105 active:scale-95"
                  >
                    {loading || status === 'creating' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                        Start
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Status details - info box style */}
            {current && (status === 'running' || status === 'paused') && (
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-border/40 bg-muted/40 p-3 text-[11px]">
                {current.sandbox_id && (
                  <div className="col-span-2 space-y-1">
                    <div className="text-muted-foreground font-medium">Sandbox ID</div>
                    <div className="font-mono text-foreground truncate" title={current.sandbox_id}>
                      {current.sandbox_id}
                    </div>
                  </div>
                )}

                {current.created_at && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground font-medium">Created</div>
                    <div className="text-foreground font-medium">{formatDate(current.created_at)}</div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="text-muted-foreground font-medium">Expires</div>
                  <div className="text-foreground font-medium">
                    {currentHasTimeout ? formatDate(current.expires_at) : 'Never'}
                  </div>
                </div>

                {current.error_message && (
                  <div className="col-span-2 lg:col-span-4 mt-1 rounded bg-destructive/10 px-2 py-1.5 text-destructive font-medium border border-destructive/20 text-[11px]">
                    {current.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Section 2: Configuration ─── */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 py-1">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Configuration</span>
            {editsLocked && (
              <span className="ml-auto text-[10px] text-muted-foreground">Locked while running</span>
            )}
          </div>

          <div className="space-y-2.5 rounded-lg border bg-card p-3">
            {/* Image */}
            <div className="space-y-1">
              <Label htmlFor="sandbox-image" className="text-[11px] text-muted-foreground">
                Image
              </Label>
              <Input
                id="sandbox-image"
                type="text"
                value={imageDraft}
                onChange={(e) => setImageDraft(e.target.value)}
                placeholder="Default image (e.g. python:3.12)"
                disabled={editsLocked}
                className="h-8 text-xs"
              />
            </div>

            {/* Timeout */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="sandbox-timeout" className="text-[11px] text-muted-foreground">
                  Timeout
                </Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {timeoutEnabled ? 'Enabled' : 'No expiry'}
                  </span>
                  <Switch
                    checked={timeoutEnabled}
                    onCheckedChange={setTimeoutEnabled}
                    disabled={editsLocked}
                    className="scale-[0.8]"
                  />
                </div>
              </div>
              {timeoutEnabled && (
                <div className="flex items-center gap-2">
                  <Input
                    id="sandbox-timeout"
                    type="number"
                    min={1}
                    value={timeoutDraft}
                    onChange={(e) => setTimeoutDraft(e.target.value)}
                    placeholder="600"
                    disabled={editsLocked}
                    className="h-8 text-xs flex-1"
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">seconds</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Section 3: Environment Variables (collapsible) ─── */}
        <div className="space-y-0">
          <SectionHeader
            icon={Variable}
            title="Environment Variables"
            count={envCount}
            open={envOpen}
            onToggle={() => setEnvOpen((o) => !o)}
            action={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  if (!envOpen) setEnvOpen(true);
                  setEnvDrafts((prev) => ({ ...prev, '': '' }));
                }}
                disabled={editsLocked || '' in envDrafts}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />

          {envOpen && (
            <div className="rounded-lg border bg-card p-3">
              {envCount === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  No variables configured
                </p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(envDrafts).map(([key, value], index) => (
                    <div key={index} className="flex items-center gap-1.5">
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
                        className="h-7 text-xs font-mono flex-1 min-w-0"
                      />
                      <span className="text-muted-foreground text-xs">=</span>
                      <Input
                        value={value}
                        onChange={(e) =>
                          setEnvDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder="value"
                        disabled={editsLocked}
                        className="h-7 text-xs font-mono flex-1 min-w-0"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setEnvDrafts((prev) => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          })
                        }
                        disabled={editsLocked}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Section 4: Host Mounts (collapsible) ─── */}
        <div className="space-y-0">
          <SectionHeader
            icon={HardDrive}
            title="Host Mounts"
            count={mountCount}
            open={mountsOpen}
            onToggle={() => setMountsOpen((o) => !o)}
            action={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  if (!mountsOpen) setMountsOpen(true);
                  setMountDrafts((prev) => [...prev, { ...EMPTY_MOUNT }]);
                }}
                disabled={editsLocked}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />

          {mountsOpen && (
            <div className="rounded-lg border bg-card p-3">
              {mountCount === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  No mounts configured
                </p>
              ) : (
                <div className="space-y-2">
                  {mountDrafts.map((mount, index) => (
                    <div
                      key={index}
                      className="rounded-md border border-dashed p-2.5 space-y-2"
                    >
                      {/* Mount header */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          #{index + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {mount.read_only ? 'Read-only' : 'Read-write'}
                            </span>
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
                              className="scale-[0.7]"
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setMountDrafts((prev) => prev.filter((_, i) => i !== index))
                            }
                            disabled={editsLocked}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Paths */}
                      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
                        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
                          Host
                        </Label>
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
                          className="h-7 text-xs"
                        />

                        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
                          Mount
                        </Label>
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
                          className="h-7 text-xs"
                        />

                        <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
                          Sub
                        </Label>
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
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Save bar ─── */}
        {!editsLocked && hasDrafts && (
          <div className="sticky bottom-0 pt-2 pb-1 bg-background/80 backdrop-blur-sm">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading}
              className="w-full h-8"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
