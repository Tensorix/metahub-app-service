import { useEffect, useState, useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionDialog } from '@/components/SessionDialog';
import { cn } from '@/lib/utils';
import { MessageSquare, Search } from 'lucide-react';

interface SessionSidebarProps {
  onSessionSelect?: () => void;
}

export function SessionSidebar({ onSessionSelect }: SessionSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const sessions = useChatStore((state) => state.sessions);
  const sessionsLoading = useChatStore((state) => state.sessionsLoading);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const selectSession = useChatStore((state) => state.selectSession);
  const createSession = useChatStore((state) => state.createSession);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <span className="font-semibold">会话</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreateDialog(true)}
        >
          新建
        </Button>
      </div>

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
            <button
              key={session.id}
              type="button"
              onClick={() => {
                void selectSession(session.id);
                onSessionSelect?.();
              }}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                currentSessionId === session.id && 'bg-accent',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 font-medium">
                  {session.name || '未命名会话'}
                </span>
                <Badge
                  variant={getTypeBadgeVariant(session.type)}
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {getTypeLabel(session.type)}
                </Badge>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="line-clamp-1">
                  {session.source || '默认来源'}
                </span>
                {session.last_visited_at && (
                  <span>
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
            </button>
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
    </div>
  );
}

