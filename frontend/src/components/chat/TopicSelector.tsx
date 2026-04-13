import { useCallback, useState } from 'react';
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
import { cn, formatRelativeTime } from '@/lib/utils';
import { computeBoundaryPreview } from '@/lib/topicBoundaryPreview';
import { ChevronDown, Hash, Plus, Check, X, ChevronUp } from 'lucide-react';

function topicRowPreviewStyle(isPreview: boolean, boundaryProgress: number) {
  if (!isPreview) return undefined;
  return { opacity: Math.min(1, 0.72 + boundaryProgress / 350) } as const;
}

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

  const { previewTopicId, highlightAnchorDown } = computeBoundaryPreview(
    topics,
    currentTopicId,
    boundaryDirection,
  );

  const isCurrentPreview =
    highlightAnchorDown && boundaryProgress > 0 && !!currentTopicId;

  const selectedRowRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'end' });
    });
  }, []);

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

  const renderTopicRow = (topic: Topic | VirtualTopic) => {
    const t = topic as Topic | VirtualTopic;
    const isVirtual = (t as VirtualTopic).is_virtual === true;
    const isSelected = topic.id === currentTopicId;
    const isPreview =
      (topic.id === previewTopicId && boundaryProgress > 0) ||
      (isSelected && isCurrentPreview);
    const showUp = isPreview && boundaryDirection === 'up';
    const showDown = isPreview && boundaryDirection === 'down';

    return (
      <DropdownMenuItem
        ref={isSelected ? selectedRowRef : undefined}
        className={cn(
          'relative flex min-h-10 cursor-pointer items-center justify-between gap-2 px-2 py-2',
          isSelected && 'bg-surface-hover',
          isPreview && 'border border-brand/35 bg-brand/5 shadow-sm',
        )}
        style={topicRowPreviewStyle(!!isPreview, boundaryProgress)}
        onClick={() => {
          void selectTopic(topic.id);
        }}
      >
        {isSelected && !isPreview && (
          <div className="absolute left-0.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {showUp && <ChevronUp className="h-3 w-3 shrink-0 text-brand" aria-hidden />}
          {showDown && <ChevronDown className="h-3 w-3 shrink-0 text-brand" aria-hidden />}
          {isSelected && !isPreview && <Check className="h-3 w-3 shrink-0" />}
          <span className="line-clamp-1 text-xs">{t.name || '未命名话题'}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatRelativeTime(t.created_at)}
          </span>
          {isVirtual && (
            <Badge
              variant="outline"
              className="h-4 border-muted-foreground/25 px-1 text-[8px] font-normal text-muted-foreground"
            >
              历史
            </Badge>
          )}
        </div>
      </DropdownMenuItem>
    );
  };

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
      <DropdownMenuContent className="w-80 p-0" align="start">
        <ScrollArea className="max-h-[min(320px,70vh)]">
          <div className="p-1">
            {topics.length === 0 && !isCreating ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                暂无话题，发送第一条消息将自动创建
              </div>
            ) : (
              <div className="space-y-0.5">
                {topics.map((topic) => renderTopicRow(topic as Topic | VirtualTopic))}
              </div>
            )}

            {isCreating && (
              <div className="mt-1 space-y-2 border-t p-2">
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
                    className="h-8 min-h-10 flex-1 text-xs"
                    onClick={handleCreateTopic}
                    disabled={!newTopicName.trim()}
                  >
                    创建
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 min-h-10 text-xs"
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
              <DropdownMenuItem onClick={() => setIsCreating(true)} className="min-h-10 px-2 py-2">
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
