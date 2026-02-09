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
import { Badge } from '@/components/ui/badge';
import type { Agent, AgentCreate, AgentUpdate, MountedSubagentSummary } from '@/lib/agentManagementApi';
import type { McpServerResponse } from '@/types/mcpServer';
import { X, Plus } from 'lucide-react';
import { useTools } from '@/hooks/useTools';
import { MCPServerConfig } from './MCPServerConfig';
import { SubAgentSection } from './SubAgentSection';

interface AgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSubmit: (data: AgentCreate | AgentUpdate) => Promise<void>;
}

export function AgentDialog({ open, onOpenChange, agent, onSubmit }: AgentDialogProps) {
  // 获取可用工具列表
  const { tools, categories, loading: toolsLoading, error: toolsError } = useTools();
  
  // 获取所有有效工具名称的集合
  const validToolNames = new Set(tools.map(t => t.name));
  
  // 检查工具是否失效
  const isToolInvalid = (toolName: string) => !validToolNames.has(toolName);
  
  // 获取失效的工具列表
  const getInvalidTools = (toolList: string[]) => {
    return toolList.filter(tool => isToolInvalid(tool));
  };

  const [formData, setFormData] = useState<AgentCreate>({
    name: '',
    description: '',
    system_prompt: '',
    model: 'gpt-4o-mini',
    model_provider: 'openai',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    skills: [],
    memory_files: [],
    summarization: {
      enabled: false,
      max_messages: 50,
      keep_last_n: 20,
    },
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'subagents' | 'summarization' | 'mcp'>('basic');
  const [mcpServers, setMcpServers] = useState<McpServerResponse[]>([]);
  const [mountedSubagents, setMountedSubagents] = useState<MountedSubagentSummary[]>([]);

  // Skill/Memory editing states
  const [editingSkill, setEditingSkill] = useState<{ name: string; content: string } | null>(null);
  const [editingMemory, setEditingMemory] = useState<{ name: string; content: string } | null>(null);

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        description: agent.description || '',
        system_prompt: agent.system_prompt || '',
        model: agent.model || 'gpt-4o-mini',
        model_provider: agent.model_provider || 'openai',
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.max_tokens ?? 4096,
        tools: agent.tools || [],
        skills: agent.skills || [],
        memory_files: agent.memory_files || [],
        summarization: agent.summarization || {
          enabled: false,
          max_messages: 50,
          keep_last_n: 20,
        },
      });
      setMountedSubagents(agent.subagents || []);
      setMcpServers(agent.mcp_servers || []);
    } else {
      setFormData({
        name: '',
        description: '',
        system_prompt: '',
        model: 'gpt-4o-mini',
        model_provider: 'openai',
        temperature: 0.7,
        max_tokens: 4096,
        tools: [],
        skills: [],
        memory_files: [],
        summarization: {
          enabled: false,
          max_messages: 50,
          keep_last_n: 20,
        },
      });
      setMountedSubagents([]);
      setMcpServers([]);
    }
    setActiveTab('basic');
  }, [agent, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (agent) {
        // 编辑模式：更新 Agent 基本信息
        await onSubmit(formData);
        // SubAgent 挂载在 SubAgentSection 中实时管理，不需要在 submit 时处理
      } else {
        // 创建模式：可选内联挂载
        const createData: AgentCreate = {
          ...formData,
          mount_subagents: mountedSubagents.map((sa) => ({
            agent_id: sa.agent_id,
            mount_description: sa.mount_description,
            sort_order: sa.sort_order,
          })),
        };
        await onSubmit(createData);
      }
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = (tool: string) => {
    const tools = formData.tools || [];
    if (tools.includes(tool)) {
      setFormData({ ...formData, tools: tools.filter(t => t !== tool) });
    } else {
      setFormData({ ...formData, tools: [...tools, tool] });
    }
  };

  const addSkill = () => {
    if (editingSkill && editingSkill.name.trim()) {
      const skills = formData.skills || [];
      const existingIndex = skills.findIndex(s => s.name === editingSkill.name);
      if (existingIndex >= 0) {
        skills[existingIndex] = editingSkill;
      } else {
        skills.push(editingSkill);
      }
      setFormData({ ...formData, skills });
      setEditingSkill(null);
    }
  };

  const removeSkill = (name: string) => {
    setFormData({
      ...formData,
      skills: (formData.skills || []).filter(s => s.name !== name),
    });
  };

  const addMemoryFile = () => {
    if (editingMemory && editingMemory.name.trim()) {
      const memory_files = formData.memory_files || [];
      const existingIndex = memory_files.findIndex(m => m.name === editingMemory.name);
      if (existingIndex >= 0) {
        memory_files[existingIndex] = editingMemory;
      } else {
        memory_files.push(editingMemory);
      }
      setFormData({ ...formData, memory_files });
      setEditingMemory(null);
    }
  };

  const removeMemoryFile = (name: string) => {
    setFormData({
      ...formData,
      memory_files: (formData.memory_files || []).filter(m => m.name !== name),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent ? '编辑 Agent' : '创建 Agent'}</DialogTitle>
          <DialogDescription>
            {agent ? '修改 Agent 配置' : '创建一个新的 AI Agent，支持子代理、技能和记忆'}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            type="button"
            className={`px-4 py-2 ${activeTab === 'basic' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('basic')}
          >
            基础配置
          </button>
          <button
            type="button"
            className={`px-4 py-2 ${activeTab === 'advanced' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('advanced')}
          >
            高级功能
          </button>
          <button
            type="button"
            className={`px-4 py-2 ${activeTab === 'subagents' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('subagents')}
          >
            子代理 ({mountedSubagents.length})
          </button>
          <button
            type="button"
            className={`px-4 py-2 ${activeTab === 'mcp' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('mcp')}
          >
            MCP Servers ({mcpServers.length})
          </button>
          <button
            type="button"
            className={`px-4 py-2 ${activeTab === 'summarization' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('summarization')}
          >
            对话摘要
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Basic Tab */}
            {activeTab === 'basic' && (
              <>
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
                  <Label htmlFor="description">描述</Label>
                  <Input
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Agent 的能力描述，被挂载为 SubAgent 时用于任务匹配"
                  />
                  <p className="text-xs text-muted-foreground">
                    当此 Agent 被其他 Agent 挂载为子代理时，父 Agent 根据此描述决定是否委派任务
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="system_prompt">系统提示词</Label>
                  <textarea
                    id="system_prompt"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

                <div className="grid gap-2">
                  <Label>工具</Label>
                  {toolsLoading ? (
                    <div className="text-sm text-muted-foreground">加载工具列表...</div>
                  ) : toolsError ? (
                    <div className="text-sm text-destructive">
                      加载工具失败: {toolsError}
                    </div>
                  ) : (
                    <>
                      {/* 显示失效的工具（如果有） */}
                      {getInvalidTools(formData.tools || []).length > 0 && (
                        <div className="border border-destructive/50 rounded-lg p-3 space-y-2 bg-destructive/5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-destructive">⚠️ 失效的工具</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getInvalidTools(formData.tools || []).map((tool) => (
                              <Badge
                                key={tool}
                                variant="destructive"
                                className="cursor-pointer"
                                onClick={() => toggleTool(tool)}
                              >
                                {tool}
                                <X className="ml-1 h-3 w-3" />
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-destructive">
                            这些工具在系统中不存在，点击删除它们
                          </p>
                        </div>
                      )}
                      
                      {/* 按分类显示有效工具 */}
                      {categories.length > 0 ? (
                        <div className="space-y-3">
                          {categories.map((category) => (
                            <div key={category.category} className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground uppercase">
                                {category.category}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {category.tools.map((tool) => {
                                  const isSelected = (formData.tools || []).includes(tool.name);
                                  return (
                                    <Badge
                                      key={tool.name}
                                      variant={isSelected ? 'default' : 'outline'}
                                      className="cursor-pointer hover:bg-primary/90"
                                      onClick={() => toggleTool(tool.name)}
                                      title={tool.description}
                                    >
                                      {tool.name}
                                      {isSelected && <X className="ml-1 h-3 w-3" />}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {tools.map((tool) => {
                            const isSelected = (formData.tools || []).includes(tool.name);
                            return (
                              <Badge
                                key={tool.name}
                                variant={isSelected ? 'default' : 'outline'}
                                className="cursor-pointer hover:bg-primary/90"
                                onClick={() => toggleTool(tool.name)}
                                title={tool.description}
                              >
                                {tool.name}
                                {isSelected && <X className="ml-1 h-3 w-3" />}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    点击选择工具。内置工具（文件系统、计划）会自动启用。
                  </p>
                </div>
              </>
            )}

            {/* Advanced Tab */}
            {activeTab === 'advanced' && (
              <>
                {/* Skills Section */}
                <div className="grid gap-2">
                  <Label>Skills（技能）</Label>
                  
                  {editingSkill ? (
                    <div className="border rounded-lg p-4 space-y-3">
                      <Input
                        placeholder="技能名称（如：research）"
                        value={editingSkill.name}
                        onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                      />
                      <textarea
                        className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        placeholder="# Skill Content&#10;&#10;描述这个技能的工作流程..."
                        value={editingSkill.content}
                        onChange={(e) => setEditingSkill({ ...editingSkill, content: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={addSkill}>
                          保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingSkill(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSkill({ name: '', content: '' })}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        添加 Skill
                      </Button>
                      <div className="space-y-2">
                        {(formData.skills || []).map((skill, index) => (
                          <div key={index} className="border rounded-lg p-3 flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium">{skill.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{skill.content}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingSkill(skill)}
                              >
                                编辑
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => removeSkill(skill.name)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Skills 是可重用的工作流，Agent 会自动读取
                  </p>
                </div>

                {/* Memory Files Section */}
                <div className="grid gap-2">
                  <Label>Memory Files（记忆）</Label>
                  
                  {editingMemory ? (
                    <div className="border rounded-lg p-4 space-y-3">
                      <Input
                        placeholder="记忆名称（如：project_context）"
                        value={editingMemory.name}
                        onChange={(e) => setEditingMemory({ ...editingMemory, name: e.target.value })}
                      />
                      <textarea
                        className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        placeholder="# Memory Content&#10;&#10;项目上下文、用户偏好等..."
                        value={editingMemory.content}
                        onChange={(e) => setEditingMemory({ ...editingMemory, content: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={addMemoryFile}>
                          保存
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingMemory(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingMemory({ name: '', content: '' })}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        添加 Memory
                      </Button>
                      <div className="space-y-2">
                        {(formData.memory_files || []).map((memory, index) => (
                          <div key={index} className="border rounded-lg p-3 flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium">{memory.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{memory.content}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingMemory(memory)}
                              >
                                编辑
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => removeMemoryFile(memory.name)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Memory 提供持久化上下文，跨对话保持
                  </p>
                </div>
              </>
            )}

            {/* SubAgents Tab */}
            {activeTab === 'subagents' && (
              <SubAgentSection
                agentId={agent?.id}
                mountedSubagents={mountedSubagents}
                onMountedChange={setMountedSubagents}
              />
            )}

            {/* MCP Servers Tab */}
            {activeTab === 'mcp' && (
              <MCPServerConfig
                agentId={agent?.id}
                servers={mcpServers}
                onChange={setMcpServers}
              />
            )}

            {/* Summarization Tab */}
            {activeTab === 'summarization' && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="summarization_enabled"
                    checked={formData.summarization?.enabled || false}
                    onChange={(e) => setFormData({
                      ...formData,
                      summarization: {
                        ...formData.summarization,
                        enabled: e.target.checked,
                      },
                    })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="summarization_enabled">启用对话摘要</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  当对话消息数超过阈值时，自动生成摘要并压缩历史，降低 token 成本
                </p>

                {formData.summarization?.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="max_messages">触发摘要的消息数</Label>
                        <Input
                          id="max_messages"
                          type="number"
                          min="10"
                          value={formData.summarization?.max_messages || 50}
                          onChange={(e) => setFormData({
                            ...formData,
                            summarization: {
                              ...formData.summarization,
                              enabled: true,
                              max_messages: parseInt(e.target.value),
                            },
                          })}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="keep_last_n">保留最近消息数</Label>
                        <Input
                          id="keep_last_n"
                          type="number"
                          min="5"
                          value={formData.summarization?.keep_last_n || 20}
                          onChange={(e) => setFormData({
                            ...formData,
                            summarization: {
                              ...formData.summarization,
                              enabled: true,
                              keep_last_n: parseInt(e.target.value),
                            },
                          })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="summary_prompt">摘要提示词（可选）</Label>
                      <textarea
                        id="summary_prompt"
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.summarization?.summary_prompt || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          summarization: {
                            ...formData.summarization,
                            enabled: true,
                            summary_prompt: e.target.value,
                          },
                        })}
                        placeholder="简要总结对话要点，保留关键信息。"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="summary_model">摘要模型（可选）</Label>
                      <Input
                        id="summary_model"
                        value={formData.summarization?.model || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          summarization: {
                            ...formData.summarization,
                            enabled: true,
                            model: e.target.value,
                          },
                        })}
                        placeholder="gpt-4o-mini（留空使用主模型）"
                      />
                      <p className="text-xs text-muted-foreground">
                        可以使用更便宜的模型生成摘要
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
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
