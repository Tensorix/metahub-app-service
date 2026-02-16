import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AgentDialog } from '@/components/AgentDialog';
import { DeleteAgentDialog } from '@/components/DeleteAgentDialog';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent, AgentCreate, AgentUpdate } from '@/lib/agentManagementApi';
import { useToast } from '@/hooks/use-toast';

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

  const pageSize = 20;

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await agentManagementApi.listAgents({
        page,
        page_size: pageSize,
        search: search || undefined,
      });
      console.log('API Response:', response);
      setAgents(response.items || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error('Failed to load agents:', error);
      setAgents([]);
      setTotal(0);
      toast({
        title: '加载失败',
        description: '无法加载 Agent 列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleCreate = async (data: AgentCreate | AgentUpdate) => {
    try {
      await agentManagementApi.createAgent(data as AgentCreate);
      toast({
        title: '创建成功',
        description: 'Agent 已创建',
      });
      loadAgents();
    } catch (error) {
      toast({
        title: '创建失败',
        description: '无法创建 Agent',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdate = async (data: AgentCreate | AgentUpdate) => {
    if (!editingAgent) return;
    try {
      await agentManagementApi.updateAgent(editingAgent.id, data as AgentUpdate);
      toast({
        title: '更新成功',
        description: 'Agent 已更新',
      });
      loadAgents();
    } catch (error) {
      toast({
        title: '更新失败',
        description: '无法更新 Agent',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await agentManagementApi.deleteAgent(deleteTarget.id);
      toast({
        title: '删除成功',
        description: 'Agent 已删除',
      });
      loadAgents();
    } catch (error) {
      toast({
        title: '删除失败',
        description: '无法删除 Agent',
        variant: 'destructive',
      });
    }
    setDeleteTarget(null);
  };

  const openCreateDialog = () => {
    setEditingAgent(null);
    setDialogOpen(true);
  };

  const openEditDialog = async (agent: Agent) => {
    // 重新获取完整的 agent 数据，确保包含 mcp_servers
    try {
      const fullAgent = await agentManagementApi.getAgent(agent.id);
      console.log('Full agent data:', fullAgent);
      console.log('MCP Servers:', fullAgent.mcp_servers);
      setEditingAgent(fullAgent);
      setDialogOpen(true);
    } catch (error) {
      console.error('Failed to load agent details:', error);
      toast({
        title: '加载失败',
        description: '无法加载 Agent 详情',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent 管理</h1>
          <p className="text-muted-foreground mt-1">管理你的 AI Agents</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          创建 Agent
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
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
      ) : agents.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <Bot className="h-16 w-16 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">暂无 Agent</h3>
              <p className="text-muted-foreground mt-1">
                {search ? '没有找到匹配的 Agent' : '创建你的第一个 AI Agent'}
              </p>
            </div>
            {!search && (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                创建 Agent
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Card key={agent.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        {agent.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        <Badge variant="secondary" className="mr-2">
                          {agent.model || 'gpt-4o-mini'}
                        </Badge>
                        <Badge variant="outline">
                          {agent.model_provider || 'openai'}
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* 描述 */}
                    {agent.description && (
                      <p className="text-sm text-muted-foreground italic">
                        {agent.description}
                      </p>
                    )}

                    {agent.system_prompt && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {agent.system_prompt}
                      </p>
                    )}
                    
                    {/* Tools */}
                    {agent.tools && agent.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {agent.tools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-xs">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Features */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {agent.subagents && agent.subagents.length > 0 && (
                        <Badge variant="secondary" title={
                          agent.subagents.map(sa => sa.name).join(', ')
                        }>
                          {agent.subagents.length} 子代理
                        </Badge>
                      )}
                      {agent.parent_agents_count && agent.parent_agents_count > 0 && (
                        <Badge variant="outline" className="text-xs">
                          被 {agent.parent_agents_count} 个 Agent 使用
                        </Badge>
                      )}
                      {agent.skills && agent.skills.length > 0 && (
                        <Badge variant="secondary">
                          {agent.skills.length} 技能
                        </Badge>
                      )}
                      {agent.memory_files && agent.memory_files.length > 0 && (
                        <Badge variant="secondary">
                          记忆 (AGENTS.md)
                        </Badge>
                      )}
                      {agent.mcp_servers && agent.mcp_servers.length > 0 && (
                        <Badge variant="secondary">
                          {agent.mcp_servers.length} MCP
                        </Badge>
                      )}
                      {agent.summarization?.enabled && (
                        <Badge variant="secondary">
                          摘要
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Temperature: {agent.temperature ?? 0.7}</span>
                      <span>•</span>
                      <span>Max Tokens: {agent.max_tokens ?? 4096}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(agent)}
                        className="flex-1"
                      >
                        <Pencil className="mr-2 h-3 w-3" />
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(agent)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {total > pageSize && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {page} 页，共 {Math.ceil(total / pageSize)} 页
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / pageSize)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}

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
