import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { activityApi } from '@/lib/activityApi';
import type { Activity, ActivityCreate, ActivityUpdate, RelationRef, RelationInfo } from '@/lib/activityApi';
import { sessionApi } from '@/lib/api';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { NodeTreeItem } from '@/lib/knowledgeApi';
import { Badge } from '@/components/ui/badge';
import { X, Link2, MessageSquare, FileText, Database } from 'lucide-react';

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity | null;
  onSuccess?: () => void;
}

const ActivityDialog = ({ open, onOpenChange, activity, onSuccess }: ActivityDialogProps) => {
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
  const [relationPopoverOpen, setRelationPopoverOpen] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; name?: string }[]>([]);
  const [sessionsTopics, setSessionsTopics] = useState<{ id: string; name: string; session_id: string; session_name: string }[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<NodeTreeItem[]>([]);

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
          status: 'pending',
          comments: '',
          tags: [],
        });
        setRelations([]);
      }
      setTagInput('');
      sessionApi.getSessions({ page: 1, size: 200 }).then((res) => setSessions(res.items));
      sessionApi.getSessionsTopics(500).then(setSessionsTopics);
      knowledgeApi.getTree().then((res) => {
        const flatten = (items: NodeTreeItem[]): NodeTreeItem[] =>
          items.flatMap((n) =>
            (n.node_type === 'document' || n.node_type === 'dataset')
              ? [n]
              : n.children
                ? [n, ...flatten(n.children)]
                : [n]
          );
        setKnowledgeNodes(flatten(res.items || []).filter((n) => n.node_type === 'document' || n.node_type === 'dataset'));
      });
    }
  }, [activity, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: '验证失败',
        description: '请输入活动名称',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const payload = { ...formData, relations };
      if (activity) {
        await activityApi.updateActivity(activity.id, payload as ActivityUpdate);
        toast({
          title: '更新成功',
          description: '活动已更新',
        });
      } else {
        await activityApi.createActivity(payload);
        toast({
          title: '创建成功',
          description: '活动已创建',
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: activity ? '更新失败' : '创建失败',
        description: '操作失败，请重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag) || [],
    });
  };

  const addRelation = (ref: RelationRef) => {
    if (relations.some((r) => r.type === ref.type && r.id === ref.id)) return;
    setRelations([...relations, ref]);
  };

  const removeRelation = (type: RelationRef['type'], id: string) => {
    setRelations(relations.filter((r) => !(r.type === type && r.id === id)));
  };

  const getRelationLabel = (r: RelationRef): string => {
    if (r.type === 'session') {
      const s = sessions.find((x) => x.id === r.id);
      return s ? (s.name || `会话 ${r.id.slice(0, 8)}`) : r.id.slice(0, 8);
    }
    if (r.type === 'topic') {
      const t = sessionsTopics.find((x) => x.id === r.id);
      return t ? `${t.name} (${t.session_name})` : r.id.slice(0, 8);
    }
    const n = knowledgeNodes.find((x) => x.id === r.id);
    return n ? `${n.name} (${n.node_type})` : r.id.slice(0, 8);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity ? '活动详情' : '新建活动'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">活动名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入活动名称"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">类型</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">任务</SelectItem>
                  <SelectItem value="meeting">会议</SelectItem>
                  <SelectItem value="reminder">提醒</SelectItem>
                  <SelectItem value="event">事件</SelectItem>
                  <SelectItem value="ping">Ping</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">优先级 (0-10)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">状态</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as Activity['status'] })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="active">进行中</SelectItem>
                  <SelectItem value="done">已完成</SelectItem>
                  <SelectItem value="dismissed">已忽略</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments">备注</Label>
            <Textarea
              id="comments"
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              placeholder="输入备注信息"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="remind_at">提醒时间</Label>
              <Input
                id="remind_at"
                type="datetime-local"
                value={formData.remind_at ? new Date(formData.remind_at).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, remind_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">截止日期</Label>
              <Input
                id="due_date"
                type="datetime-local"
                value={formData.due_date ? new Date(formData.due_date).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">标签</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="输入标签后按回车添加"
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                添加
              </Button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>关联的会话、话题和文档</Label>
            <div className="flex flex-wrap gap-2 items-center">
              {relations.map((r) => (
                <Badge key={`${r.type}-${r.id}`} variant="outline" className="flex items-center gap-1">
                  {r.type === 'session' && <MessageSquare className="w-3 h-3" />}
                  {r.type === 'topic' && <Link2 className="w-3 h-3" />}
                  {r.type === 'node' && <Database className="w-3 h-3" />}
                  <span className="max-w-[120px] truncate">{getRelationLabel(r)}</span>
                  <X
                    className="w-3 h-3 cursor-pointer shrink-0"
                    onClick={() => removeRelation(r.type, r.id)}
                  />
                </Badge>
              ))}
              <Popover open={relationPopoverOpen} onOpenChange={setRelationPopoverOpen}>
                <PopoverTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3">
                  添加关联
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Tabs defaultValue="session" className="w-full">
                    <TabsList className="w-full grid grid-cols-3">
                      <TabsTrigger value="session">会话</TabsTrigger>
                      <TabsTrigger value="topic">话题</TabsTrigger>
                      <TabsTrigger value="node">文档</TabsTrigger>
                    </TabsList>
                    <TabsContent value="session" className="m-0 p-0">
                      <ScrollArea className="h-48">
                        {sessions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                            onClick={() => {
                              addRelation({ type: 'session', id: s.id });
                              setRelationPopoverOpen(false);
                            }}
                          >
                            <MessageSquare className="w-4 h-4 shrink-0" />
                            {s.name || `会话 ${s.id.slice(0, 8)}`}
                          </button>
                        ))}
                        {sessions.length === 0 && <p className="p-3 text-sm text-muted-foreground">暂无会话</p>}
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="topic" className="m-0 p-0">
                      <ScrollArea className="h-48">
                        {sessionsTopics.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                            onClick={() => {
                              addRelation({ type: 'topic', id: t.id });
                              setRelationPopoverOpen(false);
                            }}
                          >
                            <Link2 className="w-4 h-4 shrink-0" />
                            <span className="truncate">{t.name}</span>
                            <span className="text-muted-foreground text-xs truncate">({t.session_name})</span>
                          </button>
                        ))}
                        {sessionsTopics.length === 0 && <p className="p-3 text-sm text-muted-foreground">暂无话题</p>}
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="node" className="m-0 p-0">
                      <ScrollArea className="h-48">
                        {knowledgeNodes.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                            onClick={() => {
                              addRelation({ type: 'node', id: n.id });
                              setRelationPopoverOpen(false);
                            }}
                          >
                            {n.node_type === 'dataset' ? <Database className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
                            <span className="truncate">{n.name}</span>
                            <span className="text-muted-foreground text-xs">({n.node_type})</span>
                          </button>
                        ))}
                        {knowledgeNodes.length === 0 && <p className="p-3 text-sm text-muted-foreground">暂无文档或表格</p>}
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : activity ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ActivityDialog;
