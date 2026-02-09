import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Search, Bot, Server, CheckCircle2 } from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent } from '@/lib/agentManagementApi';

interface AgentSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 父 Agent ID（编辑模式用于调 mountable API，创建模式为 undefined） */
  parentAgentId?: string;
  /** 已挂载的 Agent ID，需要排除 */
  excludeIds: string[];
  /** 选择回调 */
  onSelect: (agentId: string, mountDescription?: string) => void;
}

export function AgentSelectorDialog({
  open,
  onOpenChange,
  parentAgentId,
  excludeIds,
  onSelect,
}: AgentSelectorDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mountDescription, setMountDescription] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // 加载候选列表
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      if (parentAgentId) {
        // 编辑模式：调用 mountable API（后端自动排除自身/祖先/已挂载）
        const response = await agentManagementApi.listMountableAgents(
          parentAgentId,
          { search: search || undefined, page, page_size: 10 }
        );
        setAgents(response.items);
        setTotal(response.total);
      } else {
        // 创建模式：调用普通列表 API，前端排除已选
        const response = await agentManagementApi.listAgents({
          search: search || undefined,
          page,
          page_size: 10,
        });
        const filtered = response.items.filter(
          (a) => !excludeIds.includes(a.id)
        );
        setAgents(filtered);
        setTotal(response.total);
      }
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [parentAgentId, excludeIds, search, page]);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setMountDescription('');
      setSearch('');
      setPage(1);
      loadAgents();
    }
  }, [open]);

  // 搜索防抖
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(loadAgents, 300);
    return () => clearTimeout(timer);
  }, [search, page]);

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId, mountDescription || undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>选择 Agent 作为子代理</DialogTitle>
          <DialogDescription>
            选择一个已有的 Agent 挂载为当前 Agent 的子代理
          </DialogDescription>
        </DialogHeader>

        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4
                             text-muted-foreground" />
          <Input
            placeholder="搜索 Agent 名称或描述..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>

        {/* Agent 列表 */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px] max-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Bot className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? '没有找到匹配的 Agent' : '没有可挂载的 Agent'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                你可以先创建 Agent，再回来挂载
              </p>
            </div>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className={`w-full text-left p-3 rounded-lg border transition-colors
                  ${selectedId === agent.id
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:bg-muted/50'
                  }`}
                onClick={() => setSelectedId(agent.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{agent.name}</span>
                      {selectedId === agent.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-sm text-muted-foreground mt-1 ml-6">
                        {agent.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 ml-6">
                      <Badge variant="secondary" className="text-xs">
                        {agent.model || 'gpt-4o-mini'}
                      </Badge>
                      {agent.model_provider && agent.model_provider !== 'openai' && (
                        <Badge variant="outline" className="text-xs">
                          {agent.model_provider}
                        </Badge>
                      )}
                      {(agent.mcp_servers || []).length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Server className="h-3 w-3 mr-1" />
                          MCP: {agent.mcp_servers!.length}
                        </Badge>
                      )}
                      {(agent.tools || []).length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {agent.tools!.length} 工具
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* 分页 */}
        {total > 10 && (
          <div className="flex items-center justify-center gap-2 py-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {Math.ceil(total / 10)}
            </span>
            <Button
              variant="ghost" size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 10)}
            >
              下一页
            </Button>
          </div>
        )}

        {/* 角色描述 */}
        {selectedId && (
          <div className="space-y-2 border-t pt-3">
            <Label>角色描述 (可选)</Label>
            <Input
              value={mountDescription}
              onChange={(e) => setMountDescription(e.target.value)}
              placeholder="例如: 负责所有搜索任务"
            />
            <p className="text-xs text-muted-foreground">
              指定此子代理在当前 Agent 中的角色定位，留空则使用子代理的通用描述
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!selectedId}
            onClick={handleConfirm}
          >
            挂载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
