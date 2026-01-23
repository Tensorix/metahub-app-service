import { useState } from 'react';
import type { Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Hash, Plus, X, ChevronUp, ChevronDown, Check } from 'lucide-react';

interface TopicSidebarProps {
  className?: string;
}

export function TopicSidebar({ className }: TopicSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const currentTopicId = useChatStore((state) => state.currentTopicId);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);
  const getAllTopicsForSession = useChatStore((state) => state.getAllTopicsForSession);
  const selectTopic = useChatStore((state) => state.selectTopic);
  const createTopic = useChatStore((state) => state.createTopic);
  const boundaryProgress = useChatStore((state) => state.boundaryProgress);
  const boundaryDirection = useChatStore((state) => state.boundaryDirection);
  const rightDrawerOpen = useChatStore((state) => state.rightDrawerOpen);
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

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4" />
          <span className="text-sm font-semibold">话题</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 px-2 py-2">
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
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => handleSelectTopic(topic.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent',
                    isSelected && 'bg-accent',
                    isPreview && 'ring-2 ring-primary/50 bg-primary/10',
                  )}
                  style={isPreview ? { opacity: 0.5 + (boundaryProgress / 200) } : undefined}
                >
                  <div className="flex items-center gap-2">
                    {isPreview && boundaryDirection === 'up' && (
                      <ChevronUp className="h-3 w-3 text-primary animate-bounce shrink-0" />
                    )}
                    {isPreview && boundaryDirection === 'down' && (
                      <ChevronDown className="h-3 w-3 text-primary animate-bounce shrink-0" />
                    )}
                    {isSelected && !isPreview && <Check className="h-3 w-3 shrink-0" />}
                    <span className="line-clamp-1 flex-1">
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
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString('zh-CN')}
                  </p>
                </button>
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
