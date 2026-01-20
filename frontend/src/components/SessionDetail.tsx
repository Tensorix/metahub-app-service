import { useEffect, useState } from 'react';
import type { Session, Topic, Message } from '@/lib/api';
import { sessionApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { 
  MessageSquare, 
  Calendar, 
  Tag, 
  Hash,
  Edit,
  Trash2,
  Plus,
  MoreVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionDetailProps {
  sessionId: string;
  onEdit: () => void;
  onDelete: () => void;
  onCreateTopic: () => void;
  onTopicEdit: (topic: Topic) => void;
  onTopicDelete: (topicId: string) => void;
  onTopicSelect: (topicId: string) => void;
}

export function SessionDetail({ sessionId, onEdit, onDelete, onCreateTopic, onTopicEdit, onTopicDelete, onTopicSelect }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionDetail();
  }, [sessionId]);

  const loadSessionDetail = async () => {
    try {
      setLoading(true);
      const [sessionData, topicsData, messagesData] = await Promise.all([
        sessionApi.getSession(sessionId),
        sessionApi.getTopics(sessionId),
        sessionApi.getMessages(sessionId, { page: 1, size: 5 }),
      ]);
      setSession(sessionData);
      setTopics(topicsData);
      setRecentMessages(messagesData.items);
    } catch (error) {
      console.error('Failed to load session detail:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">会话不存在</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-2xl">{session.name || '未命名会话'}</CardTitle>
              <Badge
                variant="outline"
                className={cn('text-xs', getSessionTypeColor(session.type))}
              >
                {getSessionTypeLabel(session.type)}
              </Badge>
              {session.unread_count > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {session.unread_count} 未读
                </Badge>
              )}
            </div>
            <CardDescription>会话 ID: {session.id}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              编辑
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              删除
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-6">
        {/* 基本信息 */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            基本信息
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">会话类型</p>
              <p className="font-medium">{getSessionTypeLabel(session.type)}</p>
            </div>
            {session.source && (
              <div>
                <p className="text-muted-foreground mb-1">来源</p>
                <p className="font-medium">{session.source}</p>
              </div>
            )}
            {session.agent_id && (
              <div>
                <p className="text-muted-foreground mb-1">关联 Agent</p>
                <p className="font-medium font-mono text-xs">{session.agent_id}</p>
              </div>
            )}
          </div>
        </div>

        {/* 时间信息 */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            时间信息
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">创建时间</p>
              <p className="font-medium">{formatDateTime(session.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">更新时间</p>
              <p className="font-medium">{formatDateTime(session.updated_at)}</p>
            </div>
            {session.last_visited_at && (
              <div>
                <p className="text-muted-foreground mb-1">最后访问</p>
                <p className="font-medium">{formatDateTime(session.last_visited_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* 话题列表 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Hash className="h-4 w-4" />
              话题列表 ({topics.length})
            </h3>
            <Button variant="outline" size="sm" onClick={onCreateTopic}>
              <Plus className="h-4 w-4 mr-2" />
              新建话题
            </Button>
          </div>
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无话题
            </p>
          ) : (
            <div className="space-y-2">
              {topics.map((topic) => (
                <Card 
                  key={topic.id} 
                  className="p-3 hover:shadow-sm transition-all cursor-pointer hover:border-primary/50"
                  onClick={() => onTopicSelect(topic.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{topic.name || '未命名话题'}</p>
                        <p className="text-xs text-muted-foreground">
                          创建于 {formatDateTime(topic.created_at)}
                        </p>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon-sm">
                            <MoreVertical className="h-4 w-4" />
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
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* 元数据 */}
        {session.metadata && Object.keys(session.metadata).length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">元数据</h3>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
              {JSON.stringify(session.metadata, null, 2)}
            </pre>
          </div>
        )}

        {/* 最近消息 */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            最近消息
          </h3>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              暂无消息
            </p>
          ) : (
            <div className="space-y-2">
              {recentMessages.map((message) => (
                <Card key={message.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs">
                      {message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">
                        {message.parts[0]?.content || '(无内容)'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
