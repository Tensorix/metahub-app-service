import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Plus, Link2, X, GripVertical, ExternalLink, Server, Pencil,
} from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { MountedSubagentSummary } from '@/lib/agentManagementApi';
import { AgentSelectorDialog } from './AgentSelectorDialog';
import { QuickCreateAgentDialog } from './QuickCreateAgentDialog';
import { useToast } from '@/hooks/use-toast';

interface SubAgentSectionProps {
  /** 当前 Agent ID（编辑模式有值，创建模式为 undefined） */
  agentId?: string;
  /** 已挂载的 SubAgent 列表 */
  mountedSubagents: MountedSubagentSummary[];
  /** 挂载列表变更回调 */
  onMountedChange: (subagents: MountedSubagentSummary[]) => void;
}

export function SubAgentSection({
  agentId,
  mountedSubagents,
  onMountedChange,
}: SubAgentSectionProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [editingMount, setEditingMount] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const { toast } = useToast();

  // ── 挂载回调 ──
  const handleMount = useCallback(
    async (selectedAgentId: string, mountDescription?: string) => {
      if (agentId) {
        // 编辑模式：直接调 API
        try {
          const result = await agentManagementApi.mountSubagent(agentId, {
            agent_id: selectedAgentId,
            mount_description: mountDescription,
            sort_order: mountedSubagents.length,
          });
          onMountedChange([...mountedSubagents, result]);
          toast({ title: '挂载成功' });
        } catch (error: any) {
          toast({
            title: '挂载失败',
            description: error.response?.data?.detail || '未知错误',
            variant: 'destructive',
          });
        }
      } else {
        // 创建模式：暂存到本地 state（创建 Agent 时一起提交）
        // 需要先获取子 Agent 的基本信息用于展示
        try {
          const childAgent = await agentManagementApi.getAgent(selectedAgentId);
          const summary: MountedSubagentSummary = {
            agent_id: childAgent.id,
            name: childAgent.name,
            description: childAgent.description,
            mount_description: mountDescription,
            effective_description: mountDescription || childAgent.description || '',
            model: childAgent.model,
            model_provider: childAgent.model_provider,
            tools: childAgent.tools || [],
            has_mcp_servers: (childAgent.mcp_servers || []).length > 0,
            sort_order: mountedSubagents.length,
          };
          onMountedChange([...mountedSubagents, summary]);
        } catch {
          toast({
            title: '获取 Agent 信息失败',
            variant: 'destructive',
          });
        }
      }
      setSelectorOpen(false);
    },
    [agentId, mountedSubagents, onMountedChange, toast]
  );

  // ── 卸载回调 ──
  const handleUnmount = useCallback(
    async (childId: string) => {
      if (agentId) {
        try {
          await agentManagementApi.unmountSubagent(agentId, childId);
          toast({ title: '已卸载' });
        } catch (error: any) {
          toast({
            title: '卸载失败',
            description: error.response?.data?.detail || '未知错误',
            variant: 'destructive',
          });
          return;
        }
      }
      onMountedChange(mountedSubagents.filter((sa) => sa.agent_id !== childId));
    },
    [agentId, mountedSubagents, onMountedChange, toast]
  );

  // ── 更新挂载描述 ──
  const handleUpdateDescription = useCallback(
    async (childId: string) => {
      if (agentId) {
        try {
          await agentManagementApi.updateMount(agentId, childId, {
            mount_description: editDescription,
          });
        } catch (error: any) {
          toast({
            title: '更新失败',
            variant: 'destructive',
          });
          return;
        }
      }
      onMountedChange(
        mountedSubagents.map((sa) =>
          sa.agent_id === childId
            ? {
                ...sa,
                mount_description: editDescription,
                effective_description: editDescription || sa.description || '',
              }
            : sa
        )
      );
      setEditingMount(null);
      setEditDescription('');
    },
    [agentId, editDescription, mountedSubagents, onMountedChange, toast]
  );

  // ── 快速创建后自动挂载 ──
  const handleQuickCreate = useCallback(
    async (newAgentId: string) => {
      setQuickCreateOpen(false);
      await handleMount(newAgentId);
    },
    [handleMount]
  );

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">
          子代理 ({mountedSubagents.length})
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectorOpen(true)}
          >
            <Link2 className="h-4 w-4 mr-2" />
            选择已有 Agent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            快速新建
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        将已有的 Agent 挂载为子代理。主 Agent 可以在对话中将任务委派给子代理处理。
        子代理拥有独立的工具、MCP Server 和模型配置。
      </p>

      {/* 已挂载列表 */}
      {mountedSubagents.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <p className="text-muted-foreground">暂无子代理</p>
          <p className="text-xs text-muted-foreground mt-1">
            点击「选择已有 Agent」挂载子代理，或「快速新建」创建并挂载
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mountedSubagents.map((sa) => (
            <div
              key={sa.agent_id}
              className="border rounded-lg p-4 space-y-2 hover:border-primary/50 transition-colors"
            >
              {/* 头部：名称 + 操作按钮 */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{sa.name}</span>
                      {sa.model && (
                        <Badge variant="secondary" className="text-xs">
                          {sa.model}
                        </Badge>
                      )}
                      {sa.model_provider && sa.model_provider !== 'openai' && (
                        <Badge variant="outline" className="text-xs">
                          {sa.model_provider}
                        </Badge>
                      )}
                      {sa.has_mcp_servers && (
                        <Badge variant="outline" className="text-xs">
                          <Server className="h-3 w-3 mr-1" />
                          MCP
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingMount(sa.agent_id);
                      setEditDescription(sa.mount_description || '');
                    }}
                    title="编辑角色描述"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(`/agents?edit=${sa.agent_id}`, '_blank')}
                    title="打开 Agent 详情"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleUnmount(sa.agent_id)}
                    title="卸载"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* 角色描述 */}
              {editingMount === sa.agent_id ? (
                <div className="flex gap-2 pl-7">
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="在当前 Agent 中负责什么角色..."
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleUpdateDescription(sa.agent_id)}
                  >
                    保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingMount(null)}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pl-7">
                  {sa.effective_description || '(无描述)'}
                </p>
              )}

              {/* 工具 Badge */}
              {sa.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-7">
                  {sa.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 弹窗 */}
      <AgentSelectorDialog
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        parentAgentId={agentId}
        excludeIds={mountedSubagents.map((sa) => sa.agent_id)}
        onSelect={handleMount}
      />

      <QuickCreateAgentDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={handleQuickCreate}
      />
    </div>
  );
}
