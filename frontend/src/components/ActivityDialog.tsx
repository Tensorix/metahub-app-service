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
import type { ActivityComment, Activity, ActivityCreate, ActivityUpdate, RelationRef, RelationInfo } from '@/lib/activityApi';
import { sessionApi } from '@/lib/api';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { NodeTreeItem } from '@/lib/knowledgeApi';
import { Badge } from '@/components/ui/badge';
import { RelationLink } from '@/components/RelationLink';
import {
  X, Link2, MessageSquare, FileText, Database, Plus, Calendar, Tag,
  AlertCircle, Send, User, Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

// ──────────────────────────────────────────── types

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity | null;
  defaultStatus?: Activity['status'];
  onSuccess?: () => void;
}

// ──────────────────────────────────────────── config

const PRIORITY_PRESETS = [
  { value: 1, label: '低', color: 'bg-slate-400 dark:bg-slate-500' },
  { value: 3, label: '中', color: 'bg-amber-500' },
  { value: 5, label: '高', color: 'bg-orange-500' },
  { value: 8, label: '紧急', color: 'bg-red-500' },
];

const TYPE_DOT: Record<string, string> = {
  task:     'bg-blue-500',
  meeting:  'bg-violet-500',
  reminder: 'bg-amber-500',
  event:    'bg-emerald-500',
  ping:     'bg-cyan-500',
  other:    'bg-slate-400',
};

const TYPE_LABELS: Record<string, string> = {
  task: '任务', meeting: '会议', reminder: '提醒',
  event: '事件', ping: 'Ping', other: '其他',
};

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  pending:   { dot: 'bg-slate-400',  label: '待处理' },
  active:    { dot: 'bg-blue-500',   label: '进行中' },
  done:      { dot: 'bg-emerald-500', label: '已完成' },
  dismissed: { dot: 'bg-slate-300 dark:bg-slate-600', label: '已忽略' },
};

// ──────────────────────────────────────────── helpers

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60 select-none">
        {children}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`} />;
}

// ──────────────────────────────────────────── component

const ActivityDialog = ({ open, onOpenChange, activity, defaultStatus, onSuccess }: ActivityDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ActivityCreate>({
    type: 'task',
    name: '',
    priority: 5,
    status: 'pending',
    notes: '',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [relations, setRelations] = useState<RelationRef[]>([]);
  const [showRelationPicker, setShowRelationPicker] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; name?: string }[]>([]);
  const [sessionsTopics, setSessionsTopics] = useState<{ id: string; name: string; session_id: string; session_name: string }[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<NodeTreeItem[]>([]);

  // Comments state
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  // Reset form on open
  useEffect(() => {
    if (open) {
      if (activity) {
        setFormData({
          type: activity.type,
          name: activity.name,
          priority: activity.priority,
          status: activity.status,
          notes: activity.notes || '',
          tags: activity.tags || [],
          remind_at: activity.remind_at,
          due_date: activity.due_date,
        });
        setRelations(
          (activity.relations || []).map((r: RelationInfo) => ({ type: r.type, id: r.id }))
        );
        activityApi.getActivityComments(activity.id).then(setComments);
      } else {
        setFormData({
          type: 'task',
          name: '',
          priority: 5,
          status: defaultStatus || 'pending',
          notes: '',
          tags: [],
        });
        setRelations([]);
        setComments([]);
      }
      setTagInput('');
      setNewComment('');
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

  const handleCommentSubmit = async () => {
    if (!newComment.trim() || !activity) return;
    setSubmittingComment(true);
    try {
      const added = await activityApi.createActivityComment(activity.id, { content: newComment.trim() });
      setComments([added, ...comments]);
      setNewComment('');
      toast({ title: '已发送评论' });
    } catch {
      toast({ title: '评论发送失败', variant: 'destructive' });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentDelete = async (id: string) => {
    setDeletingComment(id);
    try {
      await activityApi.deleteActivityComment(id);
      setComments(comments.filter(c => c.id !== id));
      toast({ title: '已删除评论' });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setDeletingComment(null);
    }
  };

  // ──────── Form

  const renderForm = () => (
    <form id="activity-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
      {/* Name */}
      <div>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="输入活动名称..."
          className="text-base font-semibold h-11 border-0 border-b border-transparent focus-visible:border-primary bg-muted/40 hover:bg-muted/60 px-3 rounded-lg focus-visible:ring-0 focus-visible:bg-transparent transition-all"
          required
          autoFocus
        />
      </div>

      {/* Type + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">类型</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => setFormData({ ...formData, type: value })}
          >
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_DOT).map(([key, dot]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <StatusDot className={dot} />
                    {TYPE_LABELS[key]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">状态</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData({ ...formData, status: value as Activity['status'] })}
          >
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, { dot, label }]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <StatusDot className={dot} />
                    {label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label className="text-[11px] font-medium text-muted-foreground">
          优先级
          <span className="ml-1.5 text-foreground tabular-nums">P{formData.priority}</span>
        </Label>
        <div className="flex items-center gap-1.5">
          {PRIORITY_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setFormData({ ...formData, priority: p.value })}
              className={`
                flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer
                ${formData.priority === p.value
                  ? `${p.color} text-white shadow-sm`
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
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
            className="w-14 h-8 text-center text-xs rounded-lg tabular-nums"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">备注</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="添加备注信息..."
          rows={3}
          className="resize-none rounded-lg text-sm"
        />
      </div>

      <SectionHeader>日期与提醒</SectionHeader>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
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
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
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

      <SectionHeader>标签与关联</SectionHeader>

      {/* Tags */}
      <div className="space-y-2">
        <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
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

      {/* Relations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            关联资源
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 cursor-pointer"
            onClick={() => setShowRelationPicker(!showRelationPicker)}
          >
            <Plus className="w-3 h-3" />
            添加
          </Button>
        </div>
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
          <p className="text-xs text-muted-foreground/50 italic">暂无关联资源</p>
        )}
      </div>
    </form>
  );

  // ──────── Footer

  const renderFooter = () => (
    <DialogFooter className="px-6 py-3.5 bg-muted/20">
      <Button
        type="button"
        variant="ghost"
        onClick={() => onOpenChange(false)}
        className="rounded-lg text-muted-foreground hover:text-foreground"
      >
        取消
      </Button>
      <Button
        type="submit"
        form="activity-form"
        disabled={loading}
        className="rounded-lg gap-1.5 min-w-[88px]"
      >
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
  );

  // ──────── Comments

  const renderComments = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <ScrollArea className="flex-1">
        {comments.length > 0 ? (
          <div className="space-y-1 p-4">
            {comments.map((c) => (
              <div key={c.id} className="group flex gap-3 py-3 px-2 rounded-xl hover:bg-muted/30 transition-colors">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-border/50">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground/80">
                      User {c.user_id.slice(-4)}
                    </span>
                    <span className="text-muted-foreground/50">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: zhCN })}
                    </span>
                    <button
                      onClick={() => handleCommentDelete(c.id)}
                      disabled={deletingComment === c.id}
                      className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                      title="删除评论"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                    {c.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
            <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium">暂无评论</p>
            <p className="text-xs mt-0.5 text-muted-foreground/40">在下方分享您的想法...</p>
          </div>
        )}
      </ScrollArea>

      {/* Comment input */}
      <div className="border-t p-3 bg-muted/10">
        <div className="flex gap-2 items-end">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="写下评论..."
            rows={1}
            className="resize-none rounded-xl text-sm flex-1 min-h-[40px] max-h-[120px] py-2.5 px-3.5 border-border/60 focus-visible:ring-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCommentSubmit();
              }
            }}
          />
          <Button
            size="icon"
            className="h-10 w-10 rounded-xl shrink-0 cursor-pointer"
            disabled={!newComment.trim() || submittingComment}
            onClick={handleCommentSubmit}
          >
            {submittingComment ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1.5 text-right select-none">
          Cmd + Enter 发送
        </p>
      </div>
    </div>
  );

  // ──────── Main render

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden rounded-2xl border-border/60 shadow-xl">
          {activity ? (
            /* ──── Edit mode: tabs */
            <Tabs defaultValue="details" className="w-full flex-1 flex flex-col min-h-0 h-full">
              {/* Header with tabs */}
              <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold tracking-tight truncate">
                    {formData.name || '编辑活动'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground/70 mt-0.5">
                    修改详情或发表评论
                  </DialogDescription>
                </div>
                <TabsList className="h-9 p-1 bg-muted/50 rounded-lg shrink-0">
                  <TabsTrigger value="details" className="text-xs px-3 h-7 rounded-md cursor-pointer">
                    详情
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="text-xs px-3 h-7 rounded-md flex items-center gap-1.5 cursor-pointer">
                    评论
                    {comments.length > 0 && (
                      <span className="bg-primary/10 text-primary text-[10px] leading-none font-semibold px-1.5 py-0.5 rounded-full">
                        {comments.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>
              <Separator />
              <TabsContent value="details" className="m-0 flex-1 min-h-0 flex flex-col focus-visible:outline-none">
                <ScrollArea className="flex-1">
                  {renderForm()}
                </ScrollArea>
                <Separator />
                {renderFooter()}
              </TabsContent>
              <TabsContent value="comments" className="m-0 flex-1 min-h-0 flex flex-col focus-visible:outline-none">
                {renderComments()}
              </TabsContent>
            </Tabs>
          ) : (
            /* ──── Create mode: simple */
            <div className="flex flex-col h-full">
              <DialogHeader className="px-6 pt-5 pb-3">
                <DialogTitle className="text-base font-semibold tracking-tight">新建活动</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground/70">
                  创建一个新的活动来跟踪您的工作
                </DialogDescription>
              </DialogHeader>
              <Separator />
              <ScrollArea className="flex-1 max-h-[calc(85vh-140px)]">
                {renderForm()}
              </ScrollArea>
              <Separator />
              {renderFooter()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ──── Relation Picker Dialog */}
      <Dialog open={showRelationPicker} onOpenChange={setShowRelationPicker}>
        <DialogContent className="max-w-md max-h-[75vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden border-border/60 shadow-xl">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-sm font-semibold">添加关联</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground/70">
              将会话、话题或文档关联到此活动
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <Tabs defaultValue="session" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="w-full grid grid-cols-3 mx-5 mt-3" style={{ width: 'calc(100% - 2.5rem)' }}>
              <TabsTrigger value="session" className="text-xs gap-1 cursor-pointer">
                <MessageSquare className="w-3 h-3" />
                会话
              </TabsTrigger>
              <TabsTrigger value="topic" className="text-xs gap-1 cursor-pointer">
                <Link2 className="w-3 h-3" />
                话题
              </TabsTrigger>
              <TabsTrigger value="node" className="text-xs gap-1 cursor-pointer">
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
                        className={`w-full px-3 py-2 text-left text-sm rounded-lg flex items-center gap-2 transition-colors duration-150 cursor-pointer ${
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
                        className={`w-full px-3 py-2 text-left text-sm rounded-lg flex items-center gap-2 transition-colors duration-150 cursor-pointer ${
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
                        className={`w-full px-3 py-2 text-left text-sm rounded-lg flex items-center gap-2 transition-colors duration-150 cursor-pointer ${
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
            <Button type="button" variant="outline" size="sm" className="rounded-lg cursor-pointer" onClick={() => setShowRelationPicker(false)}>
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ActivityDialog;
