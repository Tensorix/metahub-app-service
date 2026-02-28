import { useState, useEffect } from 'react';
import type { Session, SessionCreate, SessionUpdate } from '@/lib/api';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent } from '@/lib/agentManagementApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SearchIndexManager } from './SearchIndexManager';
import { Settings, Search, Download, Loader2, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { useSessionTransfer } from '@/hooks/useSessionTransfer';
import { useToast } from '@/hooks/use-toast';
import { formatDateForInput } from '@/lib/utils';

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: Session;
  onSubmit: (data: SessionCreate | SessionUpdate) => Promise<void>;
}

export function SessionDialog({ open, onOpenChange, session, onSubmit }: SessionDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ai');
  const [source, setSource] = useState('');
  const [agentId, setAgentId] = useState<string>('');
  const [autoSendIM, setAutoSendIM] = useState(true);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  // 导出选项状态
  const [exportFormat, setExportFormat] = useState<'json' | 'jsonl'>('json');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [enableDateRange, setEnableDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const {
    exporting,
    exportSession,
    exportError,
  } = useSessionTransfer();

  useEffect(() => {
    if (open) {
      // Load agents when dialog opens
      agentManagementApi.listAgents({ page: 1, page_size: 100 })
        .then(response => setAgents(response.items))
        .catch(console.error);
    }
  }, [open]);

  useEffect(() => {
    if (session) {
      setName(session.name || '');
      setType(session.type);
      setSource(session.source || '');
      setAgentId(session.agent_id || '');
      setAutoSendIM(session.metadata?.auto_send_im !== false); // 默认 true
      setAutoReplyEnabled(session.auto_reply_enabled ?? false);
    } else {
      setName('');
      setType('ai');
      setSource('');
      setAgentId('');
      setAutoSendIM(true);
      setAutoReplyEnabled(false);
      setShowAdvanced(false);
    }
  }, [session, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isIMSession = type === 'pm' || type === 'group';
      const data = {
        name: name || undefined,
        type,
        source: source || undefined,
        agent_id: agentId || undefined,
        auto_reply_enabled: isIMSession ? autoReplyEnabled : undefined,
        metadata: isIMSession ? {
          ...(session?.metadata || {}),
          auto_send_im: autoSendIM,
        } : session?.metadata,
      };

      await onSubmit(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!session) return;
    
    try {
      await exportSession(session.id, {
        format: exportFormat,
        includeDeleted,
        startDate: enableDateRange && startDate ? startDate : undefined,
        endDate: enableDateRange && endDate ? endDate : undefined,
      });
      toast({
        title: '导出成功',
        description: `${exportFormat.toUpperCase()} 格式会话数据已下载`,
      });
    } catch (error) {
      toast({
        title: '导出失败',
        description: exportError || '导出过程中发生错误',
        variant: 'destructive',
      });
    }
  };

  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
    setEnableDateRange(true);
  };

  const isEditMode = !!session;
  const showSearchIndex = isEditMode && (session.type === 'pm' || session.type === 'group');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isEditMode ? 'max-w-2xl' : undefined}>
        <DialogHeader>
          <DialogTitle>{session ? '会话设置' : '创建会话'}</DialogTitle>
          <DialogDescription>
            {session ? '管理会话信息和搜索设置' : '创建一个新的会话'}
          </DialogDescription>
        </DialogHeader>

        {isEditMode ? (
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className={`grid w-full ${showSearchIndex ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                基本信息
              </TabsTrigger>
              <TabsTrigger value="export" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                导出数据
              </TabsTrigger>
              {showSearchIndex && (
                <TabsTrigger value="search" className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  搜索索引
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="basic">
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">会话名称</Label>
                    <Input
                      id="name"
                      placeholder="输入会话名称"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">会话类型</Label>
                    <select
                      id="type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="pm">私聊</option>
                      <option value="group">群聊</option>
                      <option value="ai">AI</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="source">来源</Label>
                    <Input
                      id="source"
                      placeholder="例如: astr_wechat, astr_qq"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent">关联 Agent (可选)</Label>
                    <select
                      id="agent"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={agentId}
                      onChange={(e) => {
                        setAgentId(e.target.value);
                        if (!e.target.value) {
                          setAutoReplyEnabled(false); // 清除 Agent 时关闭自动回复
                        }
                      }}
                    >
                      <option value="">无</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* IM 会话配置 */}
                  {(type === 'pm' || type === 'group') && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="autoSendIM"
                            checked={autoSendIM}
                            onChange={(e) => setAutoSendIM(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <Label htmlFor="autoSendIM" className="cursor-pointer">
                            自动发送到 IM 平台
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          启用后，发送的消息会直接通过 IM Gateway 发送到对应平台（私聊/群聊）
                        </p>
                      </div>

                      {/* 自动回复配置 */}
                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="autoReply" className="cursor-pointer font-medium">
                              自动回复
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              收到消息时，由关联的 Agent 自动生成回复
                            </p>
                          </div>
                          <Switch
                            id="autoReply"
                            checked={autoReplyEnabled}
                            onCheckedChange={setAutoReplyEnabled}
                            disabled={!agentId}
                          />
                        </div>

                        {autoReplyEnabled && !agentId && (
                          <p className="text-xs text-destructive">
                            请先选择一个 Agent 才能启用自动回复
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={loading}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? '保存中...' : '保存'}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="export" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">导出会话数据</CardTitle>
                  <CardDescription>
                    将会话数据导出为文件，可用于备份或迁移
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 导出格式 */}
                  <div className="space-y-2">
                    <Label>导出格式</Label>
                    <Select 
                      value={exportFormat} 
                      onValueChange={(value: string) => setExportFormat(value as 'json' | 'jsonl')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">JSON（易读）</SelectItem>
                        <SelectItem value="jsonl">JSONL（流式处理）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 包含已删除 */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-deleted">包含已删除消息</Label>
                    <Switch
                      id="include-deleted"
                      checked={includeDeleted}
                      onCheckedChange={setIncludeDeleted}
                    />
                  </div>

                  {/* 增量导出 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="date-range">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        按时间范围导出
                      </Label>
                      <Switch
                        id="date-range"
                        checked={enableDateRange}
                        onCheckedChange={setEnableDateRange}
                      />
                    </div>

                    {enableDateRange && (
                      <div className="space-y-2 pl-4 border-l-2">
                        <div className="flex gap-2 text-xs">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickRange(7)}
                          >
                            最近 7 天
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickRange(30)}
                          >
                            最近 30 天
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">开始时间</Label>
                            <Input
                              type="datetime-local"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">结束时间</Label>
                            <Input
                              type="datetime-local"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 导出按钮 */}
                  <Button 
                    type="button"
                    onClick={handleExport} 
                    disabled={exporting}
                    className="w-full"
                  >
                    {exporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        导出中...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        导出
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {showSearchIndex && (
              <TabsContent value="search" className="mt-4">
                <SearchIndexManager
                  sessionId={session.id}
                  sessionName={session.name}
                />
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {/* 会话名称 */}
              <div className="space-y-2">
                <Label htmlFor="name">会话名称</Label>
                <Input
                  id="name"
                  placeholder="输入会话名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* 关联 Agent */}
              <div className="space-y-2">
                <Label htmlFor="agent">关联 Agent</Label>
                <Select
                  value={agentId || 'none'}
                  onValueChange={(value) => {
                    const id = value === 'none' ? '' : value;
                    setAgentId(id);
                    if (!id) setAutoReplyEnabled(false);
                  }}
                >
                  <SelectTrigger id="agent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 高级选项 */}
              <div className="space-y-3">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    if (showAdvanced) {
                      setType('ai');
                      setSource('');
                      setAutoReplyEnabled(false);
                    }
                    setShowAdvanced(!showAdvanced);
                  }}
                >
                  {showAdvanced
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />
                  }
                  高级选项
                </button>

                {showAdvanced && (
                  <div className="space-y-4 rounded-md border px-3 py-3">
                    {/* 会话类型 */}
                    <div className="space-y-2">
                      <Label htmlFor="type">会话类型</Label>
                      <Select
                        value={type}
                        onValueChange={(value) => {
                          setType(value);
                          if (value === 'ai') {
                            setAutoReplyEnabled(false);
                            setSource('');
                          }
                        }}
                      >
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ai">AI 会话</SelectItem>
                          <SelectItem value="pm">私聊（IM 调试）</SelectItem>
                          <SelectItem value="group">群聊（IM 调试）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* IM 会话专属配置 */}
                    {(type === 'pm' || type === 'group') && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="source">来源</Label>
                          <Input
                            id="source"
                            placeholder="例如: astr_wechat, astr_qq"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="autoSendIM"
                              checked={autoSendIM}
                              onChange={(e) => setAutoSendIM(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor="autoSendIM" className="cursor-pointer">
                              自动发送到 IM 平台
                            </Label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            启用后，发送的消息会直接通过 IM Gateway 发送到对应平台（私聊/群聊）
                          </p>
                        </div>

                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label htmlFor="autoReply" className="cursor-pointer font-medium">
                                自动回复
                              </Label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                收到消息时，由关联的 Agent 自动生成回复
                              </p>
                            </div>
                            <Switch
                              id="autoReply"
                              checked={autoReplyEnabled}
                              onCheckedChange={setAutoReplyEnabled}
                              disabled={!agentId}
                            />
                          </div>
                          {autoReplyEnabled && !agentId && (
                            <p className="text-xs text-destructive">
                              请先选择一个 Agent 才能启用自动回复
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
