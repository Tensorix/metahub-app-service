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
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SearchIndexManager } from './SearchIndexManager';
import { Settings, Search } from 'lucide-react';

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: Session;
  onSubmit: (data: SessionCreate | SessionUpdate) => Promise<void>;
}

export function SessionDialog({ open, onOpenChange, session, onSubmit }: SessionDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('pm');
  const [source, setSource] = useState('');
  const [agentId, setAgentId] = useState<string>('');
  const [autoSendIM, setAutoSendIM] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

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
    } else {
      setName('');
      setType('pm');
      setSource('');
      setAgentId('');
      setAutoSendIM(true);
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

  const isEditMode = !!session;
  const showSearchIndex = isEditMode && (session.type === 'pm' || session.type === 'group');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showSearchIndex ? 'max-w-2xl' : undefined}>
        <DialogHeader>
          <DialogTitle>{session ? '会话设置' : '创建会话'}</DialogTitle>
          <DialogDescription>
            {session ? '管理会话信息和搜索设置' : '创建一个新的会话'}
          </DialogDescription>
        </DialogHeader>

        {showSearchIndex ? (
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                基本信息
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                搜索索引
              </TabsTrigger>
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
                      onChange={(e) => setAgentId(e.target.value)}
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

            <TabsContent value="search" className="mt-4">
              <SearchIndexManager
                sessionId={session.id}
                sessionName={session.name}
              />
            </TabsContent>
          </Tabs>
        ) : (
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
                  onChange={(e) => setAgentId(e.target.value)}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
