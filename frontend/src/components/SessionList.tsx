import type { Session, Topic } from '@/lib/api';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  MessageSquare, 
  MoreVertical, 
  Trash2, 
  Edit, 
  ChevronRight,
  ChevronDown,
  Plus
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface SessionListProps {
  sessions: Session[];
  topics: Record<string, Topic[]>;
  selectedSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
  onSessionEdit: (session: Session) => void;
  onSessionDelete: (sessionId: string) => void;
  onTopicCreate: (sessionId: string) => void;
  onTopicEdit: (topic: Topic) => void;
  onTopicDelete: (topicId: string) => void;
  expandedSessions: Set<string>;
  onToggleExpand: (sessionId: string) => void;
}

export function SessionList({
  sessions,
  topics,
  selectedSessionId,
  onSessionSelect,
  onSessionEdit,
  onSessionDelete,
  onTopicCreate,
  onTopicEdit,
  onTopicDelete,
  expandedSessions,
  onToggleExpand,
}: SessionListProps) {
  const getSessionTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      pm: '私聊',
      group: '群聊',
      ai: 'AI',
    };
    return typeMap[type] || type;
  };

  const getSessionTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      pm: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      group: 'bg-green-500/10 text-green-500 border-green-500/20',
      ai: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    };
    return colorMap[type] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const isExpanded = expandedSessions.has(session.id);
        const sessionTopics = topics[session.id] || [];
        const isSelected = selectedSessionId === session.id;

        return (
          <div key={session.id} className="space-y-1">
            <Card
              className={cn(
                'p-3 cursor-pointer transition-all hover:shadow-md border',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/50'
              )}
              onClick={() => onSessionSelect(session.id)}
            >
              <div className="flex items-start gap-3">
                {/* 展开/收起按钮 */}
                {sessionTopics.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand(session.id);
                    }}
                    className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}

                {/* 会话图标 */}
                <div className="mt-1">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>

                {/* 会话信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">
                      {session.name || '未命名会话'}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', getSessionTypeColor(session.type))}
                    >
                      {getSessionTypeLabel(session.type)}
                    </Badge>
                    {session.unread_count > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {session.unread_count}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(session.last_visited_at || session.updated_at)}</span>
                    {session.source && (
                      <>
                        <span>•</span>
                        <span>{session.source}</span>
                      </>
                    )}
                    {sessionTopics.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{sessionTopics.length} 个话题</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 操作菜单 */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="ghost" size="icon-sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSessionEdit(session)}>
                        <Edit className="h-4 w-4 mr-2" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTopicCreate(session.id)}>
                        <Plus className="h-4 w-4 mr-2" />
                        新建话题
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onSessionDelete(session.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>

            {/* 话题列表 - 样式与文件系统一致 */}
            {isExpanded && sessionTopics.length > 0 && (
              <div className="ml-8 space-y-0.5">
                {sessionTopics.map((topic) => (
                  <div
                    key={topic.id}
                    className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm group"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSessionSelect(session.id);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {topic.name || '未命名话题'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(topic.created_at)}
                      </p>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onTopicEdit(topic)}>
                            <Edit className="h-4 w-4 mr-2" />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onTopicDelete(topic.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
