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

/* ─── Component ─── */

interface TopicSidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

export function TopicSidebar({ className, style }: TopicSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const topicRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

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
  const topics = searchQuery.trim()
    ? allTopics.filter((t) =>
        (t.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : allTopics;

  // Focus search input when toggled open
  useEffect(() => {
    if (isSearching) {
      searchInputRef.current?.focus();
    } else {
      setSearchQuery('');
    }
  }, [isSearching]);

  // Scroll to selected topic on change
  useEffect(() => {
    if (currentTopicId && topicRefs.current[currentTopicId]) {
      topicRefs.current[currentTopicId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentTopicId]);

  // Scroll to bottom when create form opens
  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  // Preview target topic (boundary scroll)
  // Topics are ascending: index 0 = oldest, last = newest
  // up = older = index-1, down = newer = index+1
  const currentIndex = topics.findIndex((t) => t.id === currentTopicId);
  const previewIndex =
    boundaryDirection === 'up'
      ? currentIndex - 1
      : boundaryDirection === 'down'
        ? currentIndex + 1
        : -1;
  const previewTopicId =
    previewIndex >= 0 && previewIndex < topics.length
      ? topics[previewIndex]?.id
      : null;

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

  return (
    <TooltipProvider delayDuration={400}>
      <div className={cn('flex h-full flex-col bg-background', className)} style={style}>
        {/* ─── Header ─── */}
        <div className="flex h-12 items-center justify-between gap-2 border-b px-3">
          <div className="flex items-center gap-2 min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              {isSearching ? (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: '100%' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 min-w-0"
                >
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      placeholder="搜索话题..."
                      className="h-7 pl-8 pr-7 text-xs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />
                    <button
                      type="button"
                      onClick={() => setIsSearching(false)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
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
                  <span className="text-sm font-semibold truncate">话题</span>
                  {allTopics.length > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-[11px] font-medium">
                      {allTopics.length}
                    </Badge>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsSearching(!isSearching)}
                  className={cn(isSearching && 'bg-surface-hover')}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">搜索</TooltipContent>
            </Tooltip>

            {currentSession && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsCreating(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建话题</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ─── Topic list ─── */}
        <ScrollArea className="flex-1">
          <div className="px-1.5 py-1.5">
            {!currentSession && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                先选择一个会话
              </p>
            )}

            {/* Flat ascending list: oldest → newest (matches chat scroll direction) */}
            {currentSession && topics.length > 0 && (
              <motion.div variants={sidebarStagger} initial="hidden" animate="visible">
                {topics.map((topic) => {
                  const t = topic as Topic | VirtualTopic;
                  const isVirtual = (t as VirtualTopic).is_virtual === true;
                  const isSelected = topic.id === currentTopicId;
                  const isPreview = topic.id === previewTopicId && boundaryProgress > 0;

                  return (
                    <motion.div
                      key={topic.id}
                      variants={listItem}
                      ref={(el) => {
                        topicRefs.current[topic.id] = el;
                      }}
                      className={cn(
                        'group relative w-full rounded-lg transition-colors duration-150',
                        isSelected
                          ? 'bg-brand/6 dark:bg-brand/10'
                          : 'hover:bg-surface-hover',
                        isPreview && 'ring-2 ring-brand/50 bg-brand/8',
                      )}
                      style={isPreview ? { opacity: 0.5 + boundaryProgress / 200 } : undefined}
                    >
                      {/* Selected accent bar */}
                      {isSelected && !isPreview && (
                        <div className="absolute left-0.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
                      )}

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
                            className="flex-1 cursor-pointer py-2.5 pl-3.5 pr-2 min-w-0"
                            onClick={() => handleSelectTopic(topic.id)}
                          >
                            {/* Line 1: name + badges */}
                            <div className="flex items-center gap-2">
                              {isPreview && boundaryDirection === 'up' && (
                                <ChevronUp className="h-3 w-3 text-brand animate-bounce shrink-0" />
                              )}
                              {isPreview && boundaryDirection === 'down' && (
                                <ChevronDown className="h-3 w-3 text-brand animate-bounce shrink-0" />
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
                                <Badge variant="secondary" className="h-4 px-1 text-[9px] shrink-0">
                                  历史
                                </Badge>
                              )}
                            </div>

                            {/* Line 2: relative time */}
                            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                              {formatRelativeTime(t.created_at)}
                            </p>
                          </div>

                          <div
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                <MoreHorizontal className="h-3.5 w-3.5" />
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
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Empty state */}
            {currentSession && topics.length === 0 && !isCreating && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                {searchQuery.trim() ? (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">没有匹配的话题</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">暂无话题</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        发送第一条消息将自动创建
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Create topic form (bottom — near newest topics) */}
            <AnimatePresence>
              {currentSession && isCreating && (
                <motion.div
                  variants={collapseVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="mt-1.5 space-y-2 rounded-lg border border-brand/20 bg-brand/4 p-2.5"
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
                      取消
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
