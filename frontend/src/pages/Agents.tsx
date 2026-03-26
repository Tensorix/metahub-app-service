import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Pencil, Trash2, Bot, X, Cpu, Wrench, Users, Brain, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentDialog } from '@/components/AgentDialog';
import { DeleteAgentDialog } from '@/components/DeleteAgentDialog';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent, AgentCreate, AgentUpdate } from '@/lib/agentManagementApi';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/contexts/PageTitleContext';
import { useBreakpoints } from '@/hooks/useMediaQuery';

/* ─── Animation variants ─── */

const listContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const listItem = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.4, 0.25, 1] as const },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } },
};

/* ─── Component ─── */

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();
  const { setTitle, setActions } = usePageTitle();
  const { isMobile } = useBreakpoints();

  const pageSize = 20;

  /* ─── Mobile page title ─── */

  useEffect(() => {
    if (isMobile) {
      setTitle('Agents');
      setActions([
        {
          key: 'create',
          label: '创建',
          icon: <Plus className="h-4 w-4" />,
          onClick: openCreateDialog,
        },
      ]);
    } else {
      setTitle(null);
      setActions([]);
    }
    return () => { setTitle(null); setActions([]); };
  }, [isMobile, setTitle, setActions]);

  /* ─── Data loading ─── */

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await agentManagementApi.listAgents({
        page,
        page_size: pageSize,
        search: search || undefined,
      });
      setAgents(response.items || []);
      setTotal(response.total || 0);
    } catch {
      setAgents([]);
      setTotal(0);
      toast({ title: '加载失败', description: '无法加载 Agent 列表', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  /* ─── CRUD handlers ─── */

  const handleCreate = async (data: AgentCreate | AgentUpdate) => {
    try {
      await agentManagementApi.createAgent(data as AgentCreate);
      toast({ title: '创建成功', description: 'Agent 已创建' });
      loadAgents();
    } catch {
      toast({ title: '创建失败', description: '无法创建 Agent', variant: 'destructive' });
    }
  };

  const handleUpdate = async (data: AgentCreate | AgentUpdate) => {
    if (!editingAgent) return;
    try {
      await agentManagementApi.updateAgent(editingAgent.id, data as AgentUpdate);
      toast({ title: '更新成功', description: 'Agent 已更新' });
      loadAgents();
    } catch {
      toast({ title: '更新失败', description: '无法更新 Agent', variant: 'destructive' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await agentManagementApi.deleteAgent(deleteTarget.id);
      toast({ title: '删除成功', description: 'Agent 已删除' });
      loadAgents();
    } catch {
      toast({ title: '删除失败', description: '无法删除 Agent', variant: 'destructive' });
    }
    setDeleteTarget(null);
  };

  const openCreateDialog = () => { setEditingAgent(null); setDialogOpen(true); };

  const openEditDialog = async (agent: Agent) => {
    try {
      const fullAgent = await agentManagementApi.getAgent(agent.id);
      setEditingAgent(fullAgent);
      setDialogOpen(true);
    } catch {
      toast({ title: '加载失败', description: '无法加载 Agent 详情', variant: 'destructive' });
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  /* ─── Render ─── */

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Desktop header */}
      {!isMobile && (
        <div className="shrink-0 px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? '加载中...' : `共 ${total} 个 Agent`}
              </p>
            </div>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              创建 Agent
            </Button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="shrink-0 px-6 pb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 bg-muted/40 border-0 focus-visible:bg-background focus-visible:ring-1"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-6 pb-6">
          {loading ? (
            <AgentGridSkeleton />
          ) : agents.length === 0 ? (
            <AgentEmptyState hasSearch={!!search} onCreate={openCreateDialog} />
          ) : (
            <div className="space-y-4">
              <motion.div
                variants={listContainer}
                initial="hidden"
                animate="visible"
                className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                <AnimatePresence mode="popLayout">
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onEdit={() => openEditDialog(agent)}
                      onDelete={() => setDeleteTarget(agent)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    上一页
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agent={editingAgent}
        onSubmit={editingAgent ? handleUpdate : handleCreate}
      />
      {deleteTarget && (
        <DeleteAgentDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          agent={deleteTarget}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}

/* ─── Agent Card ─── */

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const features = buildFeatureList(agent);

  return (
    <motion.div
      variants={listItem}
      layout
      className="group flex flex-col rounded-xl border bg-card p-4 transition-colors duration-150 hover:bg-surface-hover"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand">
          <Bot className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-tight truncate">
            {agent.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
              {agent.model || 'gpt-4o-mini'}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
              {agent.model_provider || 'openai'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Description */}
      {(agent.description || agent.system_prompt) && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {agent.description || agent.system_prompt}
        </p>
      )}

      {/* Tools */}
      {agent.tools && agent.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.tools.slice(0, 4).map((tool) => (
            <Badge key={tool} variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
              {tool}
            </Badge>
          ))}
          {agent.tools.length > 4 && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">
              +{agent.tools.length - 4}
            </Badge>
          )}
        </div>
      )}

      {/* Feature badges */}
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {features.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <f.icon className="h-3 w-3" />
              {f.label}
            </span>
          ))}
        </div>
      )}

      {/* Meta & actions */}
      <div className="mt-auto pt-3 border-t flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          T:{agent.temperature ?? 0.7} / Tokens:{agent.max_tokens ?? 4096}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onEdit}
            className="h-7 w-7"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Feature list builder ─── */

function buildFeatureList(agent: Agent) {
  const list: { icon: typeof Bot; label: string }[] = [];
  if (agent.subagents && agent.subagents.length > 0)
    list.push({ icon: Users, label: `${agent.subagents.length} 子代理` });
  if (agent.skills && agent.skills.length > 0)
    list.push({ icon: Wrench, label: `${agent.skills.length} 技能` });
  if (agent.mcp_servers && agent.mcp_servers.length > 0)
    list.push({ icon: Server, label: `${agent.mcp_servers.length} MCP` });
  if (agent.summarization?.enabled)
    list.push({ icon: Brain, label: '摘要' });
  if (agent.parent_agents_count && agent.parent_agents_count > 0)
    list.push({ icon: Cpu, label: `被 ${agent.parent_agents_count} 个引用` });
  return list;
}

/* ─── Skeleton ─── */

function AgentGridSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/* ─── Empty state ─── */

function AgentEmptyState({
  hasSearch,
  onCreate,
}: {
  hasSearch: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
        <Bot className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-medium">
        {hasSearch ? '没有匹配的 Agent' : '暂无 Agent'}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">
        {hasSearch
          ? '尝试其他关键词搜索'
          : '创建你的第一个 AI Agent，开始智能对话'}
      </p>
      {!hasSearch && (
        <Button onClick={onCreate} size="sm" className="mt-4 gap-2">
          <Plus className="h-3.5 w-3.5" />
          创建 Agent
        </Button>
      )}
    </div>
  );
}
