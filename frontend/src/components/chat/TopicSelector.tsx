import { useState } from 'react';
import type { Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronDown, Hash, Plus, Check, X, ChevronUp } from 'lucide-react';

export function TopicSelector() {
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const currentTopicId = useChatStore((state) => state.currentTopicId);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);
  const getCurrentTopic = useChatStore((state) => state.getCurrentTopic);
  const getAllTopicsForSession = useChatStore((state) => state.getAllTopicsForSession);
  const selectTopic = useChatStore((state) => state.selectTopic);
  const createTopic = useChatStore((state) => state.createTopic);

  const boundaryProgress = useChatStore((state) => state.boundaryProgress);
  const boundaryDirection = useChatStore((state) => state.boundaryDirection);
  const currentSession = getCurrentSession();
  const currentTopic = getCurrentTopic();
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
    } catch (error) {
      console.error('Failed to create topic:', error);
    }
  };

  if (!currentSession) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
          <Hash className="mr-1 h-3 w-3" />
          <span>
            {currentTopic
              ? currentTopic.name || '未命名话题'
              : '点击选择话题'}
          </span>
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 p-0" align="start">
        <ScrollArea className="max-h-[300px]">
          <div className="p-1">
            {topics.length === 0 && !isCreating ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                暂无话题，发送第一条消息将自动创建
              </div>
            ) : (
              topics.map((topic) => {
                const t = topic as Topic | VirtualTopic;
                const isVirtual = (t as VirtualTopic).is_virtual === true;
                const isSelected = topic.id === currentTopicId;
                const isPreview = topic.id === previewTopicId && boundaryProgress > 0;

                return (
                  <DropdownMenuItem
                    key={topic.id}
                    className={cn(
                      'flex items-center justify-between px-2 py-1.5',
                      isSelected && 'bg-accent',
                      isPreview && 'ring-2 ring-primary/50 bg-primary/10',
                    )}
                    style={isPreview ? { opacity: 0.5 + (boundaryProgress / 200) } : undefined}
                    onClick={() => {
                      void selectTopic(topic.id);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isPreview && boundaryDirection === 'up' && (
                        <ChevronUp className="h-3 w-3 text-primary animate-bounce shrink-0" />
                      )}
                      {isPreview && boundaryDirection === 'down' && (
                        <ChevronDown className="h-3 w-3 text-primary animate-bounce shrink-0" />
                      )}
                      {isSelected && !isPreview && <Check className="h-3 w-3 shrink-0" />}
                      <span className="line-clamp-1 text-xs">
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
                  </DropdownMenuItem>
                );
              })
            )}

            {isCreating && (
              <div className="space-y-2 p-2 border-t mt-1">
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
        {!isCreating && (
          <>
            <DropdownMenuSeparator />
            <div className="p-1">
              <DropdownMenuItem
                onClick={() => setIsCreating(true)}
                className="px-2 py-1.5"
              >
                <Plus className="mr-2 h-3 w-3" />
                <span className="text-xs">新建话题</span>
              </DropdownMenuItem>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
