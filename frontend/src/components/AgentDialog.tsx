import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Agent, AgentCreate, AgentUpdate } from '@/lib/agentManagementApi';

interface AgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSubmit: (data: AgentCreate | AgentUpdate) => Promise<void>;
}

export function AgentDialog({ open, onOpenChange, agent, onSubmit }: AgentDialogProps) {
  const [formData, setFormData] = useState<AgentCreate>({
    name: '',
    system_prompt: '',
    model: 'gpt-4o-mini',
    model_provider: 'openai',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        system_prompt: agent.system_prompt || '',
        model: agent.model || 'gpt-4o-mini',
        model_provider: agent.model_provider || 'openai',
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.max_tokens ?? 4096,
        tools: agent.tools || [],
      });
    } else {
      setFormData({
        name: '',
        system_prompt: '',
        model: 'gpt-4o-mini',
        model_provider: 'openai',
        temperature: 0.7,
        max_tokens: 4096,
        tools: [],
      });
    }
  }, [agent, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent ? '编辑 Agent' : '创建 Agent'}</DialogTitle>
          <DialogDescription>
            {agent ? '修改 Agent 配置' : '创建一个新的 AI Agent'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入 Agent 名称"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="system_prompt">系统提示词</Label>
              <textarea
                id="system_prompt"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                placeholder="输入系统提示词，定义 Agent 的行为和角色"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="model">模型</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="model_provider">模型提供商</Label>
                <Input
                  id="model_provider"
                  value={formData.model_provider}
                  onChange={(e) => setFormData({ ...formData, model_provider: e.target.value })}
                  placeholder="openai"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="max_tokens">Max Tokens</Label>
                <Input
                  id="max_tokens"
                  type="number"
                  min="1"
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : agent ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
