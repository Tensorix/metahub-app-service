import { useEffect, useState, useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionDialog } from '@/components/SessionDialog';
import { cn } from '@/lib/utils';
import { MessageSquare, Search, Upload, Archive, Trash2, MoreVertical } from 'lucide-react';
import { SessionImportDialog, BatchExportDialog } from '@/components/session-transfer';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBreakpoints } from '@/hooks/useMediaQuery';

interface SessionSidebarProps {
  onSessionSelect?: () => void;
}

export function SessionSidebar({ onSessionSelect }: SessionSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const sessions = useChatStore((state) => state.sessions);
  const sessionsLoading = useChatStore((state) => state.sessionsLoading);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const selectSession = useChatStore((state) => state.selectSession);
  const createSession = useChatStore((state) => state.createSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const { isMobile } = useBreakpoints();

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时加载一次

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      ai: 'AI',
      pm: '私聊',
      group: '群聊',
    };
    return map[type] ?? type;
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'ai':
        return 'outline' as const;
      case 'pm':
        return 'secondary' as const;
      case 'group':
        return 'default' as const;
      default:
        return 'outline' as const;
    }
  };

  const handleCreateSession = async (data: any) => {
    const session = await createSession({
      ...data,
      session_type: data.type,
    });
    setShowCreateDialog(false);
    await selectSession(session.id);
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      const matchesSearch = !searchQuery ||
        session.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !typeFilter || session.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [sessions, searchQuery, typeFilter]);

  const handleDeleteClick = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
    setDeleteDialogOpen(true);
  };

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

  return (
    <div className="flex h-full flex-col">
      {/* 移动端隐藏标题栏，因为已经在顶栏显示 */}
      {!isMobile && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="font-semibold">会话</span>
          </div>
          <div className="flex items-center gap-1">
            <SessionImportDialog
              trigger={
                <Button size="sm" variant="ghost" title="导入会话">
                  <Upload className="h-4 w-4" />
                </Button>
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
                <Button size="sm" variant="ghost" title="批量导出">
                  <Archive className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateDialog(true)}
            >
              新建
            </Button>
          </div>
        </div>
      )}

      <div className="border-b px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索会话..."
            className="h-8 pl-9 text-xs"
            disabled={sessionsLoading}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {['ai', 'pm', 'group'].map(type => (
            <Button
              key={type}
              size="sm"
              variant={typeFilter === type ? 'default' : 'outline'}
              className="h-7 text-xs px-2"
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
            >
              {getTypeLabel(type)}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 px-2 py-2">
          {sessionsLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          )}
          {!sessionsLoading && filteredSessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group relative w-full rounded-md transition-colors hover:bg-accent',
                currentSessionId === session.id && 'bg-accent',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  void selectSession(session.id);
                  onSessionSelect?.();
                }}
                className="w-full px-3 py-2 text-left text-sm"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="line-clamp-1 font-medium">
                      {session.name || '未命名会话'}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge
                        variant={getTypeBadgeVariant(session.type)}
                        className="h-4 px-1 text-[10px]"
                      >
                        {getTypeLabel(session.type)}
                      </Badge>
                      <span className="line-clamp-1 flex-1">
                        {session.source || '默认来源'}
                      </span>
                      {session.last_visited_at && (
                        <span className="flex-shrink-0">
                          {new Date(session.last_visited_at).toLocaleTimeString(
                            'zh-CN',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div 
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(session.id, e);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除会话
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </button>
            </div>
          ))}

          {!sessionsLoading && filteredSessions.length === 0 && sessions.length > 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              没有匹配的会话
            </p>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              暂无会话，先在「会话管理」中创建一个吧
            </p>
          )}
        </div>
      </ScrollArea>

      <SessionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateSession}
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
  );
}

