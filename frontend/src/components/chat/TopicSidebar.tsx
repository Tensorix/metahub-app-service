import { useState, useRef, useEffect } from 'react';
import type { Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeTime } from '@/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X, ChevronUp, ChevronDown, Check, MessageSquare, Search, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { sidebarStagger, listItem, collapseVariants } from '@/lib/motion';
import { computeBoundaryPreview } from '@/lib/topicBoundaryPreview';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopicSidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const TOPIC_LIST_FULL_ANIMATION_LIMIT = 24;
const TOPIC_LIST_PARTIAL_ANIMATION_COUNT = 12;
const TOPIC_LIST_SMOOTH_SCROLL_SCREENS = 1.25;
const TOPIC_LIST_FINAL_SMOOTH_SCROLL_SCREENS = 0.75;

function smartScrollIntoView(
  container: HTMLDivElement | null,
  target: HTMLElement | null,
  block: 'end' | 'nearest',
) {
  if (!container || !target) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  let nextScrollTop = container.scrollTop;

  if (block === 'end') {
    nextScrollTop += targetRect.bottom - containerRect.bottom;
  } else if (targetRect.top < containerRect.top) {
    nextScrollTop += targetRect.top - containerRect.top;
  } else if (targetRect.bottom > containerRect.bottom) {
    nextScrollTop += targetRect.bottom - containerRect.bottom;
  } else {
    return;
  }

  nextScrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
  const distance = Math.abs(nextScrollTop - container.scrollTop);
  const smoothThreshold = container.clientHeight * TOPIC_LIST_SMOOTH_SCROLL_SCREENS;

  if (distance <= smoothThreshold) {
    container.scrollTo({
      top: nextScrollTop,
      behavior: 'smooth',
    });
    return;
  }

  const finalSmoothDistance = container.clientHeight * TOPIC_LIST_FINAL_SMOOTH_SCROLL_SCREENS;
  const direction = nextScrollTop > container.scrollTop ? 1 : -1;
  const preScrollTop = Math.max(
    0,
    Math.min(maxScrollTop, nextScrollTop - direction * finalSmoothDistance),
  );

  container.scrollTo({ top: preScrollTop, behavior: 'auto' });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.scrollTo({
        top: nextScrollTop,
        behavior: 'smooth',
      });
    });
  });
}

function SearchResultRow({
  topic,
  isSelected,
  isPreview,
  boundaryDirection,
  boundaryProgress,
  editingTopicId,
  editName,
  setEditName,
  onSelect,
  onSaveRename,
  onCancelEdit,
  onStartRename,
  onDelete,
}: {
  topic: Topic | VirtualTopic;
  isSelected: boolean;
  isPreview: boolean;
  boundaryDirection: 'up' | 'down' | null;
  boundaryProgress: number;
  editingTopicId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  onSelect: () => void;
  onSaveRename: () => void;
  onCancelEdit: () => void;
  onStartRename: (t: Topic | VirtualTopic) => void;
  onDelete: (id: string) => void;
}) {
  const t = topic as Topic | VirtualTopic;
  const isVirtual = (t as VirtualTopic).is_virtual === true;

  return (
    <div
      className={cn(
        'group relative w-full rounded-lg border border-transparent transition-[box-shadow,opacity,border-color] duration-200',
        isSelected && 'bg-brand/6 dark:bg-brand/10',
        isPreview && 'border-brand/35 bg-brand/8 shadow-sm',
      )}
      style={isPreview ? { opacity: Math.min(1, 0.72 + boundaryProgress / 350) } : undefined}
    >
      {isSelected && !isPreview && (
        <div className="absolute left-0.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
      )}
      {editingTopicId === topic.id ? (
        <div className="flex items-center gap-2 p-2">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveRename();
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            className="h-8 text-xs"
          />
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onSaveRename}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onCancelEdit}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex min-h-10 items-center justify-between pr-2">
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              'flex min-h-10 flex-1 flex-col justify-center py-2 pl-3.5 pr-2 text-left outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <div className="flex items-center gap-2">
              {isPreview && boundaryDirection === 'up' && (
                <ChevronUp className="h-3 w-3 shrink-0 text-brand" aria-hidden />
              )}
              {isPreview && boundaryDirection === 'down' && (
                <ChevronDown className="h-3 w-3 shrink-0 text-brand" aria-hidden />
              )}
              <span
                className={cn(
                  'line-clamp-1 flex-1 truncate text-sm',
                  isSelected ? 'font-semibold' : 'font-medium',
                )}
              >
                {t.name || '未命名话题'}
              </span>
              {isVirtual && (
                <Badge variant="outline" className="h-4 border-muted-foreground/25 px-1 text-[8px] font-normal text-muted-foreground">
                  历史
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              {formatRelativeTime(t.created_at)}
            </p>
          </button>
          <div className="shrink-0 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStartRename(topic)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>重命名</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(topic.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>删除</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopicSidebar({ className, style }: TopicSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const topicRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createFormRef = useRef<HTMLDivElement>(null);

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

  const currentSession = getCurrentSession();
  const allTopics = getAllTopicsForSession(currentSessionId);

  const searchFiltered = searchQuery.trim()
    ? allTopics.filter((t) =>
        (t.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : allTopics;

  const { previewTopicId, highlightAnchorDown } = computeBoundaryPreview(
    allTopics,
    currentTopicId,
    boundaryDirection,
  );

  useEffect(() => {
    if (isSearching) {
      searchInputRef.current?.focus();
    } else {
      setSearchQuery('');
    }
  }, [isSearching]);

  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => {
        smartScrollIntoView(scrollAreaRef.current, createFormRef.current, 'nearest');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  useEffect(() => {
    if (!currentSession || isSearching || !currentTopicId) {
      return;
    }
    const timer = setTimeout(() => {
      smartScrollIntoView(scrollAreaRef.current, topicRefs.current[currentTopicId], 'end');
    }, 0);
    return () => clearTimeout(timer);
  }, [allTopics.length, currentSession, currentTopicId, isSearching]);

  const handleCreateTopic = async () => {
    if (!currentSessionId || !newTopicName.trim()) return;
    try {
      const topic = await createTopic(currentSessionId, newTopicName.trim());
      await selectTopic(topic.id);
      setNewTopicName('');
      setIsCreating(false);
      setRightDrawerOpen(false);
    } catch (error) {
      console.error('Failed to create topic:', error);
    }
  };

  const handleSelectTopic = (topicId: string) => {
    void selectTopic(topicId);
    setRightDrawerOpen(false);
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
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsSearching(false);
    }
  };

  const searchMode = isSearching;
  const showTopicList = currentSession && !searchMode;

  const renderTopicRows = (
    topics: (Topic | VirtualTopic)[],
    options: { withRefs?: boolean },
  ) => {
    const animatedRows =
      topics.length <= TOPIC_LIST_FULL_ANIMATION_LIMIT
        ? topics.length
        : TOPIC_LIST_PARTIAL_ANIMATION_COUNT;
    const rows = topics.map((topic, index) => {
      const t = topic as Topic | VirtualTopic;
      const isSelected = topic.id === currentTopicId;
      const isPreview =
        (topic.id === previewTopicId || (highlightAnchorDown && isSelected)) &&
        boundaryProgress > 0;
      const row = (
        <SearchResultRow
          topic={t}
          isSelected={isSelected}
          isPreview={!!isPreview}
          boundaryDirection={boundaryDirection}
          boundaryProgress={boundaryProgress}
          editingTopicId={editingTopicId}
          editName={editName}
          setEditName={setEditName}
          onSelect={() => handleSelectTopic(topic.id)}
          onSaveRename={handleSaveRename}
          onCancelEdit={() => setEditingTopicId(null)}
          onStartRename={handleStartRename}
          onDelete={handleDeleteTopic}
        />
      );
      const ref = options.withRefs
        ? (el: HTMLDivElement | null) => {
            topicRefs.current[topic.id] = el;
          }
        : undefined;
      const shouldAnimateRow = index < animatedRows;

      if (shouldAnimateRow) {
        return (
          <motion.div key={topic.id} variants={listItem} ref={ref}>
            {row}
          </motion.div>
        );
      }

      return (
        <div key={topic.id} ref={ref}>
          {row}
        </div>
      );
    });

    return (
      <motion.div variants={sidebarStagger} initial="hidden" animate="visible" className="space-y-0.5">
        {rows}
      </motion.div>
    );
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className={cn('flex h-full min-h-0 flex-col bg-background', className)} style={style}>
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AnimatePresence mode="wait" initial={false}>
              {isSearching ? (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: '100%' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0 flex-1"
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      placeholder="搜索话题..."
                      className="h-8 pl-8 pr-8 text-xs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />
                    <button
                      type="button"
                      onClick={() => setIsSearching(false)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="title"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <span className="truncate text-sm font-semibold">话题</span>
                  {allTopics.length > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-[11px] font-medium">
                      {allTopics.length}
                    </Badge>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsSearching(!isSearching)}
                className={cn('shrink-0', isSearching && 'bg-surface-hover')}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">搜索</TooltipContent>
          </Tooltip>
        </div>

        {/* Scroll: search = filtered list; 默认 = 全量升序列表 */}
        <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
          <div className="px-1.5 py-1.5">
            {!currentSession && (
              <p className="py-6 text-center text-xs text-muted-foreground">先选择一个会话</p>
            )}

            {currentSession && searchMode && (
              <>
                {searchFiltered.length > 0 ? (
                  renderTopicRows(searchFiltered, {})
                ) : (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">没有匹配的话题</p>
                  </div>
                )}
              </>
            )}

            {showTopicList && allTopics.length > 0 && (
              renderTopicRows(allTopics, { withRefs: true })
            )}

            {showTopicList && allTopics.length === 0 && !isCreating && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">暂无话题</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">发送第一条消息将自动创建</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {showTopicList && (
          <div className="shrink-0 border-t bg-background/95 px-2 pb-2 pt-2 shadow-[0_-1px_0_0_hsl(var(--border)/0.5)] backdrop-blur-sm">
            <AnimatePresence>
              {isCreating && (
                <motion.div
                  ref={createFormRef}
                  variants={collapseVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="mb-2 space-y-2 rounded-lg border border-border bg-muted/30 p-2.5"
                >
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
                    className="h-9 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-9 min-h-10 flex-1 text-xs"
                      onClick={handleCreateTopic}
                      disabled={!newTopicName.trim()}
                    >
                      创建
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 min-h-10 text-xs"
                      onClick={() => {
                        setIsCreating(false);
                        setNewTopicName('');
                      }}
                    >
                      取消
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!isCreating && currentSession && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-10 w-full justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                新建话题
              </Button>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
