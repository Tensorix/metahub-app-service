import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { X, Info } from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { AgentCreate } from '@/lib/agentManagementApi';
import { useTools } from '@/hooks/useTools';
import { useToast } from '@/hooks/use-toast';

interface QuickCreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 创建完成回调，传回新 Agent ID */
  onCreated: (agentId: string) => void;
}

export function QuickCreateAgentDialog({
  open, onOpenChange, onCreated,
}: QuickCreateAgentDialogProps) {
  const { tools, categories } = useTools();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<AgentCreate>({
    name: '',
    description: '',
    system_prompt: '',
    model: 'gpt-4o-mini',
    model_provider: 'openai',
    tools: [],
  });

  const toggleTool = (toolName: string) => {
    const current = form.tools || [];
    setForm({
      ...form,
      tools: current.includes(toolName)
        ? current.filter((t) => t !== toolName)
        : [...current, toolName],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const agent = await agentManagementApi.createAgent(form);
      toast({ title: '创建成功', description: `已创建 Agent「${agent.name}」` });
      onCreated(agent.id);
      // 重置表单
      setForm({
        name: '', description: '', system_prompt: '',
        model: 'gpt-4o-mini', model_provider: 'openai', tools: [],
      });
    } catch (error: any) {
      toast({
        title: '创建失败',
        description: error.response?.data?.detail || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>快速创建 Agent</DialogTitle>
          <DialogDescription>
            创建一个新 Agent 并自动挂载为子代理
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="qc-name">名称 *</Label>
            <Input
              id="qc-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如: 搜索专家"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qc-desc">描述 *</Label>
            <Input
              id="qc-desc"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="例如: 擅长网络搜索和信息检索"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="qc-model">模型</Label>
              <Input
                id="qc-model"
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qc-provider">提供商</Label>
              <Input
                id="qc-provider"
                value={form.model_provider || ''}
                onChange={(e) => setForm({ ...form, model_provider: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qc-prompt">系统提示词</Label>
            <textarea
              id="qc-prompt"
              className="flex min-h-[80px] w-full rounded-md border border-input
                         bg-background px-3 py-2 text-sm"
              value={form.system_prompt || ''}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="你是一个..."
            />
          </div>

          <div className="grid gap-2">
            <Label>工具</Label>
            <div className="space-y-2">
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase">
                      {cat.category}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.tools.map((tool) => {
                        const selected = (form.tools || []).includes(tool.name);
                        return (
                          <Badge
                            key={tool.name}
                            variant={selected ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => toggleTool(tool.name)}
                            title={tool.description}
                          >
                            {tool.name}
                            {selected && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tools.map((tool) => (
                    <Badge
                      key={tool.name}
                      variant={(form.tools || []).includes(tool.name) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleTool(tool.name)}
                    >
                      {tool.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              创建后将自动挂载为当前 Agent 的子代理。你可以稍后在 Agent 列表中编辑此
              Agent，配置 MCP Server、Skills、Memory 等高级功能。
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading || !form.name.trim()}>
              {loading ? '创建中...' : '创建并挂载'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
