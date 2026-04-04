import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModelSelect } from '@/components/ModelSelect';
import type { Agent, AgentCreate, AgentUpdate, MountedSubagentSummary } from '@/lib/agentManagementApi';
import type { McpServerResponse } from '@/types/mcpServer';
import type { UpstreamModel } from '@/lib/systemConfigApi';
import { X, Plus, ChevronDown, ChevronRight, ShieldCheck, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useTools } from '@/hooks/useTools';
import { MCPServerConfig } from './MCPServerConfig';
import { SubAgentSection } from './SubAgentSection';
import {
  getSystemConfig,
  fetchUpstreamModels,
  type ProvidersMap,
} from '@/lib/systemConfigApi';
import { collapseVariants } from '@/lib/motion';

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
    interrupt_on: {},
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

  // Provider registry + model fetching
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [upstreamModels, setUpstreamModels] = useState<UpstreamModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  // Skill editing state
  const [editingSkill, setEditingSkill] = useState<{ name: string; content: string } | null>(null);
  // 工具组展开状态
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
        interrupt_on: agent.interrupt_on || {},
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
        interrupt_on: {},
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
    setUpstreamModels([]);
  }, [agent, open]);

  // Load provider IDs from registry on mount
  useEffect(() => {
    if (!open) return;
    getSystemConfig<ProvidersMap>('providers')
      .then((resp) => {
        if (resp?.value) setProviderIds(Object.keys(resp.value));
      })
      .catch(() => {});
  }, [open]);

  const handleFetchModels = async () => {
    const provider = formData.model_provider;
    if (!provider) return;
    setFetchingModels(true);
    try {
      const result = await fetchUpstreamModels({ providerId: provider });
      setUpstreamModels(result);
    } catch {
      // silently ignore — user can still type manually
    } finally {
      setFetchingModels(false);
    }
  };

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

  /** 组级开关：全选则添加该组全部工具，取消全选则移除全部。部分启用时不显示勾选 */
  const toggleCategory = (categoryName: string) => {
    const cat = categories.find(c => c.category === categoryName);
    if (!cat) return;
    const tools = formData.tools || [];
    const catToolNames = new Set(cat.tools.map(t => t.name));
    const hasAll = cat.tools.every(t => tools.includes(t.name));
    if (hasAll) {
      const nextInterrupt = { ...(formData.interrupt_on || {}) };
      cat.tools.forEach(t => delete nextInterrupt[t.name]);
      setFormData({
        ...formData,
        tools: tools.filter(t => !catToolNames.has(t)),
        interrupt_on: nextInterrupt,
      });
    } else {
      setFormData({
        ...formData,
        tools: [...tools, ...cat.tools.map(t => t.name)],
      });
    }
  };

  const toggleInterruptOn = (toolName: string) => {
    const io = formData.interrupt_on || {};
    const current = io[toolName];
    if (current) {
      const next = { ...io };
      delete next[toolName];
      setFormData({ ...formData, interrupt_on: next });
    } else {
      setFormData({ ...formData, interrupt_on: { ...io, [toolName]: true } });
    }
  };

  /** 全选时勾选，部分启用时横线(indeterminate)，未启用时不勾选 */
  const getCategoryCheckedState = (categoryName: string): boolean | 'indeterminate' => {
    const cat = categories.find(c => c.category === categoryName);
    if (!cat) return false;
    const toolNames = formData.tools || [];
    const count = cat.tools.filter(t => toolNames.includes(t.name)).length;
    if (count === 0) return false;
    if (count === cat.tools.length) return true;
    return 'indeterminate';
  };

  const isToolEnabled = (toolName: string) => (formData.tools || []).includes(toolName);
  const isInterruptOn = (toolName: string) => !!(formData.interrupt_on || {})[toolName];

  const toggleCategoryExpanded = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryName)) next.delete(categoryName);
      else next.add(categoryName);
      return next;
    });
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

  const getAgentsMemoryContent = () => {
    const files = formData.memory_files || [];
    const preferred = files.find((m) => {
      const normalized = (m.name || '').trim().toLowerCase().replace(/\.md$/, '');
      return normalized === 'agents';
    });
    return preferred?.content || files[0]?.content || '';
  };

  const setAgentsMemoryContent = (content: string) => {
    if (!content.trim()) {
      setFormData({ ...formData, memory_files: [] });
      return;
    }
    setFormData({
      ...formData,
      memory_files: [{ name: 'AGENTS', content }],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{agent ? '编辑 Agent' : '创建 Agent'}</DialogTitle>
          <DialogDescription>
            {agent ? '修改 Agent 配置' : '创建一个新的 AI Agent，支持子代理、技能和记忆'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col min-h-0 flex-1">
            <TabsList className="shrink-0 w-full rounded-none border-b bg-transparent p-0 h-auto px-6">
              <TabsTrigger value="basic" className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:bg-transparent text-xs sm:text-sm">
                基础配置
              </TabsTrigger>
              <TabsTrigger value="advanced" className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:bg-transparent text-xs sm:text-sm">
                高级功能
              </TabsTrigger>
              <TabsTrigger value="subagents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:bg-transparent text-xs sm:text-sm">
                子代理 ({mountedSubagents.length})
              </TabsTrigger>
              <TabsTrigger value="mcp" className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:bg-transparent text-xs sm:text-sm">
                MCP ({mcpServers.length})
              </TabsTrigger>
              <TabsTrigger value="summarization" className="rounded-none border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-brand data-[state=active]:shadow-none data-[state=active]:bg-transparent text-xs sm:text-sm">
                对话摘要
              </TabsTrigger>
            </TabsList>

            {/* Basic Tab */}
            <TabsContent value="basic" className="space-y-4 py-4 px-6 flex-1 overflow-y-auto min-h-0 mt-0">
              {/* Identity section */}
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">身份</h4>
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
              </div>

              {/* System Prompt section */}
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">系统提示词</h4>
                <Textarea
                  id="system_prompt"
                  className="min-h-[120px]"
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  placeholder="输入系统提示词，定义 Agent 的行为和角色"
                />
              </div>

              {/* Model Config section */}
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">模型配置</h4>
                <div className="grid gap-2">
                  <Label>模型提供商</Label>
                  <Select
                    value={formData.model_provider}
                    onValueChange={(v) => {
                      setFormData({ ...formData, model_provider: v });
                      setUpstreamModels([]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择服务商" />
                    </SelectTrigger>
                    <SelectContent>
                      {providerIds.map((id) => (
                        <SelectItem key={id} value={id}>
                          {id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>模型</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <ModelSelect
                        value={formData.model || ''}
                        onChange={(v) => setFormData({ ...formData, model: v })}
                        models={upstreamModels}
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleFetchModels}
                      disabled={fetchingModels || !formData.model_provider}
                    >
                      {fetchingModels ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : null}
                      获取模型
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    可直接输入模型名称，或点击"获取模型"从上游拉取后输入关键词过滤
                  </p>
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

              {/* Tools section */}
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">工具</h4>
                <p className="text-xs text-muted-foreground">
                  按组启用/禁用工具；组内可细粒度配置权限及是否需人工批准执行。
                </p>
                {toolsLoading ? (
                  <div className="text-sm text-muted-foreground">加载工具列表...</div>
                ) : toolsError ? (
                  <div className="text-sm text-destructive">
                    加载工具失败: {toolsError}
                  </div>
                ) : (
                  <>
                    {/* 失效工具提示 */}
                    {getInvalidTools(formData.tools || []).length > 0 && (
                      <div className="border border-destructive/50 rounded-lg p-3 space-y-2 bg-destructive/5">
                        <span className="text-sm font-medium text-destructive">失效的工具</span>
                        <div className="flex flex-wrap gap-2">
                          {getInvalidTools(formData.tools || []).map((tool) => (
                            <Badge key={tool} variant="destructive" className="cursor-pointer" onClick={() => toggleTool(tool)}>
                              {tool} <X className="ml-1 h-3 w-3 inline" />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 按组显示：组级开关 + 组内工具权限 */}
                    {categories.length > 0 ? (
                      <div className="space-y-2 border rounded-lg divide-y">
                        {categories.map((category) => {
                          const checkedState = getCategoryCheckedState(category.category);
                          const expanded = expandedCategories.has(category.category);
                          const fullyEnabled = checkedState === true;
                          return (
                            <div key={category.category}>
                              <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-muted"
                                  onClick={() => toggleCategoryExpanded(category.category)}
                                  aria-label={expanded ? '收起' : '展开'}
                                >
                                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <Checkbox
                                    checked={checkedState}
                                    onCheckedChange={() => toggleCategory(category.category)}
                                  />
                                  <span className="text-sm font-medium">{category.category}</span>
                                  <span className="text-xs text-muted-foreground">({category.tools.length} 个工具)</span>
                                </label>
                              </div>
                              <AnimatePresence>
                                {expanded && (
                                  <motion.div
                                    variants={collapseVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                  >
                                    <div className="px-6 py-2 space-y-2 bg-muted/20">
                                      {category.tools.map((tool) => (
                                        <div key={tool.name} className="flex items-center gap-3 py-1.5">
                                          <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                                            <Checkbox
                                              checked={isToolEnabled(tool.name)}
                                              onCheckedChange={() => toggleTool(tool.name)}
                                            />
                                            <span className="text-sm truncate" title={tool.description}>{tool.name}</span>
                                          </label>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">需人工批准</span>
                                            <Switch
                                              checked={isInterruptOn(tool.name)}
                                              onCheckedChange={() => toggleInterruptOn(tool.name)}
                                              disabled={!isToolEnabled(tool.name)}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                      {!fullyEnabled && (
                                        <p className="text-xs text-muted-foreground py-2">可勾选上方工具以部分启用该组；或启用组以一键启用全部</p>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {tools.map((tool) => (
                          <Badge
                            key={tool.name}
                            variant={(formData.tools || []).includes(tool.name) ? 'default' : 'outline'}
                            className="cursor-pointer hover:bg-brand/90"
                            onClick={() => toggleTool(tool.name)}
                            title={tool.description}
                          >
                            {tool.name}
                            {(formData.tools || []).includes(tool.name) && <X className="ml-1 h-3 w-3" />}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  内置工具（文件系统、计划）会自动启用。
                </p>
              </div>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4 py-4 px-6 flex-1 overflow-y-auto min-h-0 mt-0">
              {/* Skills Section */}
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Skills（技能）</h4>

                {editingSkill ? (
                  <div className="border rounded-lg p-4 space-y-3">
                    <Input
                      placeholder="文件名（如：research）"
                      value={editingSkill.name}
                      onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      路径：{editingSkill.name ? `/skills/${editingSkill.name}/SKILL.md` : '/skills/<name>/SKILL.md'}
                    </p>
                    <Textarea
                      className="min-h-[200px] font-mono"
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
                      新建 Skill 文件
                    </Button>
                    <div className="space-y-2">
                      {(formData.skills || []).map((skill, index) => (
                        <div key={index} className="border rounded-lg p-3 flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium font-mono text-sm">/skills/{skill.name}/SKILL.md</p>
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
                  使用文件系统风格编辑 skills，运行时会挂载到 /skills/*。
                </p>
              </div>

              {/* AGENTS Memory Section */}
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">记忆（AGENTS.md）</h4>
                <p className="text-xs text-muted-foreground font-mono">/AGENTS.md</p>
                <Textarea
                  className="min-h-[220px] font-mono"
                  placeholder="# AGENTS&#10;&#10;记录长期记忆、项目约束、偏好和规范..."
                  value={getAgentsMemoryContent()}
                  onChange={(e) => setAgentsMemoryContent(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  统一使用单文件 AGENTS.md 作为持久记忆。
                </p>
              </div>
            </TabsContent>

            {/* SubAgents Tab */}
            <TabsContent value="subagents" className="py-4 px-6 flex-1 overflow-y-auto min-h-0 mt-0">
              <SubAgentSection
                agentId={agent?.id}
                mountedSubagents={mountedSubagents}
                onMountedChange={setMountedSubagents}
              />
            </TabsContent>

            {/* MCP Servers Tab */}
            <TabsContent value="mcp" className="py-4 px-6 flex-1 overflow-y-auto min-h-0 mt-0">
              <MCPServerConfig
                agentId={agent?.id}
                servers={mcpServers}
                onChange={setMcpServers}
              />
            </TabsContent>

            {/* Summarization Tab */}
            <TabsContent value="summarization" className="space-y-4 py-4 px-6 flex-1 overflow-y-auto min-h-0 mt-0">
              <div className="rounded-xl border bg-surface/50 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="summarization_enabled"
                    checked={formData.summarization?.enabled || false}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      summarization: {
                        ...formData.summarization,
                        enabled: !!checked,
                      },
                    })}
                  />
                  <Label htmlFor="summarization_enabled">启用对话摘要</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  当对话消息数超过阈值时，自动生成摘要并压缩历史，降低 token 成本
                </p>

                <AnimatePresence>
                  {formData.summarization?.enabled && (
                    <motion.div
                      variants={collapseVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="space-y-4"
                    >
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
                        <Textarea
                          id="summary_prompt"
                          className="min-h-[80px]"
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
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
