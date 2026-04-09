import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { useToast } from '../../hooks/use-toast';
import { Loader2, Container, RefreshCw, Trash2, Eye, Server } from 'lucide-react';
import {
  getSystemConfig,
  updateSystemConfig,
  type SandboxConfig,
} from '../../lib/systemConfigApi';
import {
  listSandboxes,
  getSandboxInfo,
  killSandbox,
  type SandboxAdminInfo,
  type SandboxAdminPagination,
} from '../../lib/sandboxAdminApi';

const STATE_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'Running', label: '运行中 (Running)' },
  { value: 'Pending', label: '创建中 (Pending)' },
  { value: 'Paused', label: '已暂停 (Paused)' },
  { value: 'Stopping', label: '停止中 (Stopping)' },
  { value: 'Terminated', label: '已终止 (Terminated)' },
  { value: 'Failed', label: '失败 (Failed)' },
];

function stateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = state.toLowerCase();
  if (s === 'running') return 'default';
  if (s === 'paused' || s === 'pending' || s === 'pausing' || s === 'stopping') return 'secondary';
  if (s === 'failed') return 'destructive';
  return 'outline';
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function shortId(id: string, length = 12): string {
  if (id.length <= length) return id;
  return `${id.slice(0, length)}…`;
}

export function SandboxSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [apiDomain, setApiDomain] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [useServerProxy, setUseServerProxy] = useState(false);
  const [defaultImage, setDefaultImage] = useState('ubuntu');
  const [defaultTimeout, setDefaultTimeout] = useState(600);
  const [maxPerUser, setMaxPerUser] = useState(3);

  // --- Sandbox management state ---
  const [sandboxes, setSandboxes] = useState<SandboxAdminInfo[]>([]);
  const [pagination, setPagination] = useState<SandboxAdminPagination | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>('Running');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Details dialog
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<SandboxAdminInfo | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<SandboxAdminInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const resp = await getSystemConfig<SandboxConfig>('sandbox').catch(() => null);
      if (resp?.value) {
        const v = resp.value;
        setEnabled(v.enabled ?? false);
        setApiDomain(v.api_domain ?? '');
        setApiKey(v.api_key ?? '');
        setUseServerProxy(v.use_server_proxy ?? false);
        setDefaultImage(v.default_image ?? 'ubuntu');
        setDefaultTimeout(v.default_timeout ?? 600);
        setMaxPerUser(v.max_per_user ?? 3);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemConfig('sandbox', {
        enabled,
        api_domain: apiDomain,
        api_key: apiKey,
        use_server_proxy: useServerProxy,
        default_image: defaultImage,
        default_timeout: defaultTimeout,
        max_per_user: maxPerUser,
      });
      toast({ title: '保存成功', description: '沙箱配置已更新' });
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

  const refreshList = useCallback(
    async (targetPage = page, targetState = stateFilter) => {
      setListLoading(true);
      setListError(null);
      try {
        const resp = await listSandboxes({
          states: targetState === 'all' ? undefined : [targetState],
          page: targetPage,
          pageSize,
        });
        setSandboxes(resp.sandboxes);
        setPagination(resp.pagination);
      } catch (error: any) {
        const detail = error.response?.data?.detail || String(error);
        setListError(detail);
        setSandboxes([]);
        setPagination(null);
      } finally {
        setListLoading(false);
      }
    },
    [page, stateFilter]
  );

  // Auto-load the list when sandbox is enabled and configured.
  useEffect(() => {
    if (!loading && enabled && apiDomain) {
      refreshList(1, stateFilter);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, enabled, apiDomain]);

  const handleStateFilterChange = (value: string) => {
    setStateFilter(value);
    setPage(1);
    refreshList(1, value);
  };

  const openDetails = async (sandbox: SandboxAdminInfo) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsData(sandbox);
    try {
      const fresh = await getSandboxInfo(sandbox.id);
      setDetailsData(fresh);
    } catch (error: any) {
      toast({
        title: '获取详情失败',
        description: error.response?.data?.detail || String(error),
        variant: 'destructive',
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await killSandbox(confirmDelete.id);
      toast({
        title: '删除成功',
        description: `沙箱 ${shortId(confirmDelete.id, 16)} 已终止`,
      });
      setConfirmDelete(null);
      refreshList();
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.response?.data?.detail || String(error),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Container className="h-5 w-5" />
            沙箱配置
          </CardTitle>
          <CardDescription>
            配置云端代码执行沙箱（基于 OpenSandbox）。启用后，AI 会话可按需创建隔离的执行环境。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>启用沙箱</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                全局开关，关闭后无法创建新沙箱
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label>API Domain</Label>
            <Input
              placeholder="api.opensandbox.io"
              value={apiDomain}
              onChange={(e) => setApiDomain(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              保存后 API Key 将以掩码显示
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>使用服务端代理</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                当 API Domain 无法被应用直接访问时启用（例如容器网络隔离场景）
              </p>
            </div>
            <Switch checked={useServerProxy} onCheckedChange={setUseServerProxy} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>默认镜像</Label>
              <Input
                value={defaultImage}
                onChange={(e) => setDefaultImage(e.target.value)}
                placeholder="ubuntu"
              />
            </div>
            <div className="space-y-2">
              <Label>超时时间 (秒)</Label>
              <Input
                type="number"
                value={defaultTimeout}
                onChange={(e) => setDefaultTimeout(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>每用户上限</Label>
              <Input
                type="number"
                value={maxPerUser}
                onChange={(e) => setMaxPerUser(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sandbox Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                沙箱管理
              </CardTitle>
              <CardDescription>
                通过 OpenSandbox API 直接查看并管理当前所有沙箱实例。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={stateFilter} onValueChange={handleStateFilterChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATE_FILTERS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refreshList()}
                disabled={listLoading || !enabled || !apiDomain}
                title="刷新"
              >
                <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!enabled || !apiDomain ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              请先在上方启用沙箱并配置 API Domain。
            </div>
          ) : listError ? (
            <div className="py-8 text-center text-sm text-destructive">
              加载失败：{listError}
            </div>
          ) : listLoading && sandboxes.length === 0 ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : sandboxes.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              暂无匹配的沙箱。
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sandbox ID</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">镜像</th>
                    <th className="px-3 py-2 font-medium">创建时间</th>
                    <th className="px-3 py-2 font-medium">过期时间</th>
                    <th className="px-3 py-2 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sandboxes.map((sb) => (
                    <tr key={sb.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs" title={sb.id}>
                        {shortId(sb.id, 20)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={stateVariant(sb.status.state)}>
                          {sb.status.state}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {sb.image || '-'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(sb.created_at)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(sb.expires_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDetails(sb)}
                            title="查看详情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDelete(sb)}
                            title="删除沙箱"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
              <div>
                共 {pagination.total_items} 项，第 {pagination.page} /{' '}
                {pagination.total_pages} 页
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || listLoading}
                  onClick={() => {
                    const next = Math.max(1, page - 1);
                    setPage(next);
                    refreshList(next);
                  }}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.has_next_page || listLoading}
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    refreshList(next);
                  }}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>沙箱详情</DialogTitle>
            <DialogDescription>
              {detailsData ? (
                <span className="font-mono text-xs break-all">{detailsData.id}</span>
              ) : (
                '—'
              )}
            </DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              加载详情中...
            </div>
          ) : detailsData ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <div className="text-muted-foreground">状态</div>
                <div>
                  <Badge variant={stateVariant(detailsData.status.state)}>
                    {detailsData.status.state}
                  </Badge>
                  {detailsData.status.reason && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {detailsData.status.reason}
                    </span>
                  )}
                </div>

                {detailsData.status.message && (
                  <>
                    <div className="text-muted-foreground">消息</div>
                    <div className="text-xs">{detailsData.status.message}</div>
                  </>
                )}

                <div className="text-muted-foreground">镜像</div>
                <div className="font-mono text-xs">{detailsData.image || '-'}</div>

                <div className="text-muted-foreground">创建时间</div>
                <div>{formatDate(detailsData.created_at)}</div>

                <div className="text-muted-foreground">过期时间</div>
                <div>{formatDate(detailsData.expires_at)}</div>

                <div className="text-muted-foreground">状态变更</div>
                <div>{formatDate(detailsData.status.last_transition_at)}</div>

                <div className="text-muted-foreground">Entrypoint</div>
                <div className="font-mono text-xs break-all">
                  {detailsData.entrypoint?.length
                    ? detailsData.entrypoint.join(' ')
                    : '-'}
                </div>
              </div>

              {detailsData.metadata && Object.keys(detailsData.metadata).length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1">Metadata</div>
                  <pre className="bg-muted rounded-md p-2 text-xs overflow-x-auto">
                    {JSON.stringify(detailsData.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground">无数据</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除沙箱？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将立即终止沙箱{' '}
              <span className="font-mono text-xs">
                {confirmDelete ? shortId(confirmDelete.id, 20) : ''}
              </span>
              ，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
