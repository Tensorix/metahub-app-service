import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useChatStore } from '@/store/chat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionDialog } from '@/components/SessionDialog';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  Search,
  Plus,
  MoreHorizontal,
  MoreVertical,
  Upload,
  Archive,
  Trash2,
  Pencil,
  Bot,
  User,
  Users,
  X,
  MessageSquarePlus,
} from 'lucide-react';
import { SessionImportDialog, BatchExportDialog } from '@/components/session-transfer';
import { usePageTitle } from '@/contexts/PageTitleContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import type { Session, SessionUpdate } from '@/lib/api';

/* ─── Type config ─── */

const TYPE_CONFIG = {
  ai: {
    icon: Bot,
    label: 'AI',
    bg: 'bg-purple-500/10 dark:bg-purple-400/15',
    text: 'text-purple-600 dark:text-purple-400',
    activeBg: 'bg-purple-500/15 dark:bg-purple-400/20',
  },
  pm: {
    icon: User,
    label: '私聊',
    bg: 'bg-blue-500/10 dark:bg-blue-400/15',
    text: 'text-blue-600 dark:text-blue-400',
    activeBg: 'bg-blue-500/15 dark:bg-blue-400/20',
  },
  group: {
    icon: Users,
    label: '群聊',
    bg: 'bg-emerald-500/10 dark:bg-emerald-400/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    activeBg: 'bg-emerald-500/15 dark:bg-emerald-400/20',
  },
} as const;

type SessionType = keyof typeof TYPE_CONFIG;

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type as SessionType] ?? TYPE_CONFIG.ai;
}

/* ─── Relative time ─── */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;

  // Same calendar day
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return '昨天';
  }

  if (diffDays < 7) return `${diffDays}天前`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/* ─── Component ─── */

interface SessionSidebarProps {
  onSessionSelect?: () => void;
}

export function SessionSidebar({ onSessionSelect }: SessionSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [sessionToEdit, setSessionToEdit] = useState<Session | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sessions = useChatStore((state) => state.sessions);
  const sessionsLoading = useChatStore((state) => state.sessionsLoading);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const selectSession = useChatStore((state) => state.selectSession);
  const createSession = useChatStore((state) => state.createSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const updateSession = useChatStore((state) => state.updateSession);
  const { isMobile } = useBreakpoints();
  const { openSidebar } = usePageTitle();

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus search input when toggled open
  useEffect(() => {
    if (isSearching) {
      searchInputRef.current?.focus();
    } else {
      setSearchQuery('');
    }
  }, [isSearching]);

  const handleCreateSession = async (data: any) => {
    const session = await createSession({
      ...data,
      session_type: data.type,
    });
    setShowCreateDialog(false);
    await selectSession(session.id);
  };

  const handleEditSession = async (data: SessionUpdate) => {
    if (!sessionToEdit) return;
    await updateSession(sessionToEdit.id, data);
    setSessionToEdit(null);
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesSearch =
        !searchQuery || session.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !typeFilter || session.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [sessions, searchQuery, typeFilter]);

  const handleDeleteClick = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (sessionToDelete) {
      try {
        await deleteSession(sessionToDelete);
        setDeleteDialogOpen(false);
        setSessionToDelete(null);
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsSearching(false);
    }
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        {/* ─── Header ─── */}
        <div className="flex h-12 items-center justify-between gap-2 border-b px-3">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <Button variant="ghost" size="icon-sm" onClick={openSidebar} className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            )}
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
                      placeholder="搜索会话..."
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
                <motion.span
                  key="title"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm font-semibold truncate"
                >
                  会话
                </motion.span>
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

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">新建会话</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="更多"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <SessionImportDialog
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Upload className="mr-2 h-4 w-4" />
                      导入会话
                    </DropdownMenuItem>
                  }
                  onSuccess={(ids) => {
                    void loadSessions();
                    if (ids.length === 1) {
                      void selectSession(ids[0]);
                    }
                  }}
                />
                <BatchExportDialog
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Archive className="mr-2 h-4 w-4" />
                      批量导出
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ─── Filter pills ─── */}
        <div className="flex gap-1 border-b px-3 py-1.5">
          {(['ai', 'pm', 'group'] as const).map((type) => {
            const cfg = getTypeConfig(type);
            const Icon = cfg.icon;
            const active = typeFilter === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(active ? null : type)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active
                    ? cn(cfg.activeBg, cfg.text)
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover',
                )}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* ─── Session list ─── */}
        <ScrollArea className="flex-1">
          <div className="px-1.5 py-1.5">
            {sessionsLoading && <SessionSkeleton />}

            {!sessionsLoading && filteredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={currentSessionId === session.id}
                onSelect={() => {
                  void selectSession(session.id);
                  onSessionSelect?.();
                }}
                onEdit={() => setSessionToEdit(session)}
                onDelete={(e) => handleDeleteClick(session.id, e)}
              />
            ))}

            {/* Empty: no matches */}
            {!sessionsLoading && filteredSessions.length === 0 && sessions.length > 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">没有匹配的会话</p>
              </div>
            )}

            {/* Empty: no sessions at all */}
            {!sessionsLoading && sessions.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <MessageSquarePlus className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">暂无会话</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">创建一个新会话开始对话</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  新建会话
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ─── Dialogs ─── */}
        <SessionDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSubmit={handleCreateSession}
        />

        <SessionDialog
          open={!!sessionToEdit}
          onOpenChange={(open) => !open && setSessionToEdit(null)}
          session={sessionToEdit ?? undefined}
          onSubmit={handleEditSession}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除会话</AlertDialogTitle>
              <AlertDialogDescription>
                此操作将删除该会话及其所有消息和话题。此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

/* ─── Session item ─── */

interface SessionItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function SessionItem({ session, isSelected, onSelect, onEdit, onDelete }: SessionItemProps) {
  const cfg = getTypeConfig(session.type);
  const Icon = cfg.icon;
  const hasUnread = session.unread_count > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        className={cn(
          'group relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
          isSelected
            ? 'bg-brand/6 dark:bg-brand/10'
            : 'hover:bg-surface-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-inset',
        )}
      >
        {/* Type icon */}
        <div className="relative shrink-0">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              cfg.bg,
            )}
          >
            <Icon className={cn('h-4 w-4', cfg.text)} />
          </div>
          {/* Unread dot */}
          {hasUnread && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-background" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5">
          {/* Line 1: name + time */}
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                isSelected || hasUnread ? 'font-semibold' : 'font-medium',
              )}
            >
              {session.name || '未命名会话'}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatRelativeTime(session.last_activity_at ?? session.created_at)}
            </span>
          </div>

          {/* Line 2: source + unread count */}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {session.source || '默认来源'}
            </span>
            {hasUnread && (
              <span className="inline-flex h-4.5 min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold leading-none text-brand-foreground">
                {session.unread_count > 99 ? '99+' : session.unread_count}
              </span>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(e);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Skeleton ─── */

function SessionSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-start gap-2.5 px-2.5 py-2">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-[55%]" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-[35%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
