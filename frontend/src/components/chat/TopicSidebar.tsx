import { useState } from 'react';
import type { Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Hash, Plus, X, ChevronUp, ChevronDown, Check, MessageSquare, Search, MoreHorizontal, Settings2, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopicSidebarProps {
  className?: string;
}

export function TopicSidebar({ className }: TopicSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const currentTopicId = useChatStore((state) => state.currentTopicId);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);
  const getAllTopicsForSession = useChatStore((state) => state.getAllTopicsForSession);
  const selectTopic = useChatStore((state) => state.selectTopic);
  const createTopic = useChatStore((state) => state.createTopic);
  const updateTopic = useChatStore((state) => state.updateTopic);
  const deleteTopic = useChatStore((state) => state.deleteTopic);
  const boundaryProgress = useChatStore((state) => state.boundaryProgress);
  const boundaryDirection = useChatStore((state) => state.boundaryDirection);
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);

  // 直接调用函数，因为这些函数内部会从 store 获取最新状态
  const currentSession = getCurrentSession();
  const topics = getAllTopicsForSession(currentSessionId);

  // 计算预览目标话题
  const currentIndex = topics.findIndex(t => t.id === currentTopicId);
  const previewIndex = boundaryDirection === 'up'
    ? currentIndex - 1
    : boundaryDirection === 'down'
      ? currentIndex + 1
      : -1;
  const previewTopicId = previewIndex >= 0 && previewIndex < topics.length
    ? topics[previewIndex]?.id
    : null;

  const handleCreateTopic = async () => {
    if (!currentSessionId || !newTopicName.trim()) return;
    try {
      const topic = await createTopic(currentSessionId, newTopicName.trim());
      await selectTopic(topic.id);
      setNewTopicName('');
      setIsCreating(false);
      setRightDrawerOpen(false); // 创建后关闭抽屉
    } catch (error) {
      console.error('Failed to create topic:', error);
    }
  };

  const handleSelectTopic = (topicId: string) => {
    void selectTopic(topicId);
    setRightDrawerOpen(false); // 选择后关闭抽屉
  };

  const handleStartRename = (topic: Topic | VirtualTopic) => {
    setEditingTopicId(topic.id);
    setEditName(topic.name || '');
  };

  const handleSaveRename = async () => {
    if (!editingTopicId || !editName.trim()) {
      setEditingTopicId(null);
      return;
    }
    try {
      await updateTopic(editingTopicId, { name: editName.trim() });
    } catch (error) {
      console.error('Failed to update topic:', error);
    } finally {
      setEditingTopicId(null);
      setEditName('');
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('确定要删除这个话题吗？')) return;
    try {
      await deleteTopic(topicId);
      if (currentTopicId === topicId) {
        // 如果删除的是当前话题，可能需要切换到其他话题，这里暂不处理，依赖 store 自动处理或用户手动切换
      }
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4" />
          <span className="text-sm font-semibold">话题</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="话题设置">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 px-2 py-2">
          {currentSession && (
            <div className="px-2 py-4 space-y-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold">话题列表</h3>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                点击发送按钮左侧的图标可将当前会话保存为历史话题，并开启新一轮会话
              </p>
            </div>
          )}

          {!currentSession && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              先选择一个会话
            </p>
          )}

          {currentSession &&
            topics.map((topic) => {
              const t = topic as Topic | VirtualTopic;
              const isVirtual = (t as VirtualTopic).is_virtual === true;
              const isSelected = topic.id === currentTopicId;
              const isPreview = topic.id === previewTopicId && boundaryProgress > 0;

              return (
                <div
                  key={topic.id}
                  className={cn(
                    'group w-full rounded-md text-xs transition-colors hover:bg-accent/50',
                    isSelected && 'bg-accent',
                    isPreview && 'ring-2 ring-primary/50 bg-primary/10',
                  )}
                  style={isPreview ? { opacity: 0.5 + (boundaryProgress / 200) } : undefined}
                >
                  {editingTopicId === topic.id ? (
                    <div className="flex items-center gap-2 p-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename();
                          if (e.key === 'Escape') setEditingTopicId(null);
                        }}
                        autoFocus
                        className="h-7 text-xs"
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSaveRename}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTopicId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pr-2">
                      <div 
                        className="flex-1 cursor-pointer py-2 pl-3 pr-2 min-w-0"
                        onClick={() => handleSelectTopic(topic.id)}
                      >
                        <div className="flex items-center gap-2">
                          {isPreview && boundaryDirection === 'up' && (
                            <ChevronUp className="h-3 w-3 text-primary animate-bounce shrink-0" />
                          )}
                          {isPreview && boundaryDirection === 'down' && (
                            <ChevronDown className="h-3 w-3 text-primary animate-bounce shrink-0" />
                          )}
                          {isSelected && !isPreview && <Check className="h-3 w-3 shrink-0" />}
                          <span className="line-clamp-1 flex-1 truncate">
                            {t.name || '未命名话题'}
                          </span>
                          {isVirtual && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[9px] shrink-0"
                            >
                              历史
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground truncate">
                          {new Date(t.created_at).toLocaleDateString('zh-CN')}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded-sm hover:bg-background/80 focus:opacity-100 focus:outline-none">
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleStartRename(topic)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            <span>重命名</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteTopic(topic.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>删除</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })}

          {currentSession && topics.length === 0 && !isCreating && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              暂无话题，发送第一条消息将自动创建
            </p>
          )}

          {/* 新建话题输入框 */}
          {currentSession && isCreating && (
            <div className="space-y-2 p-2 border rounded-md">
              <Input
                placeholder="输入话题名称..."
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleCreateTopic();
                  } else if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewTopicName('');
                  }
                }}
                autoFocus
                className="h-8 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 flex-1 text-xs"
                  onClick={handleCreateTopic}
                  disabled={!newTopicName.trim()}
                >
                  创建
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setIsCreating(false);
                    setNewTopicName('');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t px-3 py-2 space-y-2">
        {currentSession && !isCreating && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            新建话题
          </Button>
        )}
        <div className="text-center text-[11px] text-muted-foreground">
          {currentSession
            ? 'AI 会话将以话题为单位分页显示'
            : '未选择会话'}
        </div>
      </div>
    </div>
  );
}
