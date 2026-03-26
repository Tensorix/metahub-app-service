import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { activityApi } from '@/lib/activityApi';
import type { Activity, ActivityCreate, ActivityUpdate, RelationRef, RelationInfo } from '@/lib/activityApi';
import { sessionApi } from '@/lib/api';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { NodeTreeItem } from '@/lib/knowledgeApi';
import { Badge } from '@/components/ui/badge';
import { RelationLink } from '@/components/RelationLink';
import { X, Link2, MessageSquare, FileText, Database, Plus, Calendar, Tag, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ──────────────────────────────────────────── types

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity | null;
  defaultStatus?: Activity['status'];
  onSuccess?: () => void;
}

// ──────────────────────────────────────────── priority slider config

const PRIORITY_PRESETS = [
  { value: 1, label: '低', color: 'bg-gray-400' },
  { value: 3, label: '中', color: 'bg-yellow-500' },
  { value: 5, label: '高', color: 'bg-orange-500' },
  { value: 8, label: '紧急', color: 'bg-red-500' },
];

// ──────────────────────────────────────────── component

const ActivityDialog = ({ open, onOpenChange, activity, defaultStatus, onSuccess }: ActivityDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ActivityCreate>({
    type: 'task',
    name: '',
    priority: 5,
    status: 'pending',
    comments: '',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [relations, setRelations] = useState<RelationRef[]>([]);
  const [showRelationPicker, setShowRelationPicker] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; name?: string }[]>([]);
  const [sessionsTopics, setSessionsTopics] = useState<{ id: string; name: string; session_id: string; session_name: string }[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<NodeTreeItem[]>([]);

  // Reset form on open
  useEffect(() => {
    if (open) {
      if (activity) {
        setFormData({
          type: activity.type,
          name: activity.name,
          priority: activity.priority,
          status: activity.status,
          comments: activity.comments || '',
          tags: activity.tags || [],
          remind_at: activity.remind_at,
          due_date: activity.due_date,
        });
        setRelations(
          (activity.relations || []).map((r: RelationInfo) => ({ type: r.type, id: r.id }))
        );
      } else {
        setFormData({
          type: 'task',
          name: '',
          priority: 5,
          status: defaultStatus || 'pending',
          comments: '',
          tags: [],
        });
        setRelations([]);
      }
      setTagInput('');
      setShowRelationPicker(false);

      // Load relation data
      sessionApi.getSessions({ page: 1, size: 200 }).then((res) => setSessions(res.items));
      sessionApi.getSessionsTopics(500).then(setSessionsTopics);
      knowledgeApi.getTree().then((res) => {
        const flatten = (items: NodeTreeItem[]): NodeTreeItem[] =>
          items.flatMap((n) =>
            n.node_type === 'document' || n.node_type === 'dataset'
              ? [n]
              : n.children
                ? [n, ...flatten(n.children)]
                : [n]
          );
        setKnowledgeNodes(
          flatten(res.items || []).filter((n) => n.node_type === 'document' || n.node_type === 'dataset')
        );
      });
    }
  }, [activity, open, defaultStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: '请输入活动名称', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const payload = { ...formData, relations };
      if (activity) {
        await activityApi.updateActivity(activity.id, payload as ActivityUpdate);
        toast({ title: '更新成功' });
      } else {
        await activityApi.createActivity(payload);
        toast({ title: '创建成功' });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast({ title: activity ? '更新失败' : '创建失败', description: '操作失败，请重试', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) || [] });
  };

  const addRelation = (ref: RelationRef) => {
    if (relations.some((r) => r.type === ref.type && r.id === ref.id)) return;
    setRelations([...relations, ref]);
  };

  const removeRelation = (type: RelationRef['type'], id: string) => {
    setRelations(relations.filter((r) => !(r.type === type && r.id === id)));
  };

  const toRelationInfo = (r: RelationRef): RelationInfo => {
    const fromApi = activity?.relations?.find((x) => x.type === r.type && x.id === r.id);
    if (fromApi) return fromApi;
    if (r.type === 'session') {
      const s = sessions.find((x) => x.id === r.id);
      return { type: 'session', id: r.id, name: s ? (s.name || `会话 ${r.id.slice(0, 8)}`) : r.id.slice(0, 8) };
    }
    if (r.type === 'topic') {
      const t = sessionsTopics.find((x) => x.id === r.id);
      return { type: 'topic', id: r.id, name: t?.name ?? r.id.slice(0, 8), session_id: t?.session_id, session_name: t?.session_name };
    }
    const n = knowledgeNodes.find((x) => x.id === r.id);
    return { type: 'node', id: r.id, name: n?.name ?? r.id.slice(0, 8), node_type: n?.node_type };
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden rounded-xl">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-lg">
              {activity ? '编辑活动' : '新建活动'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {activity ? '修改活动信息' : '创建一个新的活动来跟踪您的工作'}
            </DialogDescription>
          </DialogHeader>

          <Separator />

          {/* Form */}
          <ScrollArea className="max-h-[calc(90vh-160px)]">
            <form id="activity-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

              {/* ──── Section: 基本信息 */}
              <div className="space-y-4">
                {/* Name - full width, prominent */}
                <div className="space-y-1.5">
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="活动名称"
                    className="text-base font-medium h-11 border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
                    required
                    autoFocus
                  />
                </div>

                {/* Type + Status row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">类型</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger className="h-9 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task">📋 任务</SelectItem>
                        <SelectItem value="meeting">📅 会议</SelectItem>
                        <SelectItem value="reminder">⏰ 提醒</SelectItem>
                        <SelectItem value="event">🎯 事件</SelectItem>
                        <SelectItem value="ping">📡 Ping</SelectItem>
                        <SelectItem value="other">📌 其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">状态</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as Activity['status'] })}
                    >
                      <SelectTrigger className="h-9 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">⏳ 待处理</SelectItem>
                        <SelectItem value="active">🚀 进行中</SelectItem>
                        <SelectItem value="done">✅ 已完成</SelectItem>
                        <SelectItem value="dismissed">💤 已忽略</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Priority - visual picker */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    优先级
                    <span className="ml-1.5 font-medium text-foreground">P{formData.priority}</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    {PRIORITY_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: p.value })}
                        className={`
                          flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border
                          ${formData.priority === p.value
                            ? `${p.color} text-white border-transparent shadow-sm`
                            : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                          }
                        `}
                      >
                        {p.label}
                      </button>
                    ))}
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                      className="w-16 h-8 text-center text-xs rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* ──── Section: 描述 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">备注</Label>
                <Textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  placeholder="添加备注信息..."
                  rows={3}
                  className="resize-none rounded-lg text-sm"
                />
              </div>

              {/* ──── Section: 日期 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    截止日期
                  </Label>
                  <Input
                    type="datetime-local"
                    value={formData.due_date ? new Date(formData.due_date).toISOString().slice(0, 16) : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        due_date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      })
                    }
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    提醒时间
                  </Label>
                  <Input
                    type="datetime-local"
                    value={formData.remind_at ? new Date(formData.remind_at).toISOString().slice(0, 16) : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        remind_at: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      })
                    }
                    className="h-9 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* ──── Section: 标签 */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  标签
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="输入标签按回车添加"
                    className="h-8 rounded-lg text-sm flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 rounded-lg"
                    onClick={handleAddTag}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <AnimatePresence>
                  {formData.tags && formData.tags.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="flex flex-wrap gap-1.5 overflow-hidden"
                    >
                      {formData.tags.map((tag) => (
                        <motion.div
                          key={tag}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                        >
                          <Badge
                            variant="secondary"
                            className="gap-1 text-xs rounded-md cursor-default"
                          >
                            {tag}
                            <X
                              className="w-3 h-3 cursor-pointer hover:text-destructive transition-colors"
                              onClick={() => handleRemoveTag(tag)}
                            />
                          </Badge>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ──── Section: 关联 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    关联资源
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={() => setShowRelationPicker(!showRelationPicker)}
                  >
                    <Plus className="w-3 h-3" />
                    添加
                  </Button>
                </div>

                {/* Current relations */}
                {relations.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {relations.map((r) => (
                      <RelationLink
                        key={`${r.type}-${r.id}`}
                        relation={toRelationInfo(r)}
                        variant="card"
                        onRemove={removeRelation}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">暂无关联资源</p>
                )}
              </div>
            </form>
          </ScrollArea>

          {/* Footer */}
          <Separator />
          <DialogFooter className="px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-lg">
              取消
            </Button>
            <Button type="submit" form="activity-form" disabled={loading} className="rounded-lg gap-1.5">
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  保存中...
                </>
              ) : (
                activity ? '保存更改' : '创建活动'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relation Picker Dialog */}
      <Dialog open={showRelationPicker} onOpenChange={setShowRelationPicker}>
        <DialogContent className="max-w-md max-h-[75vh] flex flex-col p-0 gap-0 rounded-xl overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base">添加关联</DialogTitle>
            <DialogDescription className="text-xs">
              将会话、话题或文档关联到此活动
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <Tabs defaultValue="session" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="w-full grid grid-cols-3 mx-5 mt-3" style={{ width: 'calc(100% - 2.5rem)' }}>
              <TabsTrigger value="session" className="text-xs gap-1">
                <MessageSquare className="w-3 h-3" />
                会话
              </TabsTrigger>
              <TabsTrigger value="topic" className="text-xs gap-1">
                <Link2 className="w-3 h-3" />
                话题
              </TabsTrigger>
              <TabsTrigger value="node" className="text-xs gap-1">
                <FileText className="w-3 h-3" />
                文档
              </TabsTrigger>
            </TabsList>

            <TabsContent value="session" className="m-0 mt-2 flex-1 min-h-0 px-2">
              <ScrollArea className="h-56">
                <div className="space-y-0.5 px-1">
                  {sessions.map((s) => {
                    const linked = relations.some((r) => r.type === 'session' && r.id === s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm rounded-md flex items-center gap-2 transition-colors duration-150 ${
                          linked ? 'bg-brand/8 text-brand' : 'hover:bg-muted'
                        }`}
                        onClick={() => linked ? removeRelation('session', s.id) : addRelation({ type: 'session', id: s.id })}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span className="truncate">{s.name || `会话 ${s.id.slice(0, 8)}`}</span>
                        {linked && <Badge variant="secondary" className="ml-auto text-[10px] h-4">已关联</Badge>}
                      </button>
                    );
                  })}
                  {sessions.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground text-center">暂无会话</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="topic" className="m-0 mt-2 flex-1 min-h-0 px-2">
              <ScrollArea className="h-56">
                <div className="space-y-0.5 px-1">
                  {sessionsTopics.map((t) => {
                    const linked = relations.some((r) => r.type === 'topic' && r.id === t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm rounded-md flex items-center gap-2 transition-colors duration-150 ${
                          linked ? 'bg-brand/8 text-brand' : 'hover:bg-muted'
                        }`}
                        onClick={() => linked ? removeRelation('topic', t.id) : addRelation({ type: 'topic', id: t.id })}
                      >
                        <Link2 className="w-4 h-4 shrink-0" />
                        <span className="truncate">{t.name}</span>
                        <span className="text-muted-foreground text-xs truncate shrink-0">({t.session_name})</span>
                        {linked && <Badge variant="secondary" className="ml-auto text-[10px] h-4">已关联</Badge>}
                      </button>
                    );
                  })}
                  {sessionsTopics.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground text-center">暂无话题</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="node" className="m-0 mt-2 flex-1 min-h-0 px-2">
              <ScrollArea className="h-56">
                <div className="space-y-0.5 px-1">
                  {knowledgeNodes.map((n) => {
                    const linked = relations.some((r) => r.type === 'node' && r.id === n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm rounded-md flex items-center gap-2 transition-colors duration-150 ${
                          linked ? 'bg-brand/8 text-brand' : 'hover:bg-muted'
                        }`}
                        onClick={() => linked ? removeRelation('node', n.id) : addRelation({ type: 'node', id: n.id })}
                      >
                        {n.node_type === 'dataset' ? <Database className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
                        <span className="truncate">{n.name}</span>
                        <span className="text-muted-foreground text-xs">({n.node_type})</span>
                        {linked && <Badge variant="secondary" className="ml-auto text-[10px] h-4">已关联</Badge>}
                      </button>
                    );
                  })}
                  {knowledgeNodes.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground text-center">暂无文档或表格</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <Separator />
          <div className="px-5 py-3 flex justify-end">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setShowRelationPicker(false)}>
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ActivityDialog;
