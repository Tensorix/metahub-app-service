import { useEffect, useState } from 'react';
import type { Topic, Message } from '@/lib/api';
import { sessionApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { 
  Hash, 
  Calendar, 
  Edit,
  Trash2,
  ArrowLeft,
  MessageSquare
} from 'lucide-react';

interface TopicDetailProps {
  topicId: string;
  sessionId: string;
  onEdit: (topic: Topic) => void;
  onDelete: (topicId: string) => void;
  onBack: () => void;
}

export function TopicDetail({ topicId, sessionId, onEdit, onDelete, onBack }: TopicDetailProps) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  useEffect(() => {
    loadTopicDetail();
    loadMessages();
  }, [topicId]);

  const loadTopicDetail = async () => {
    try {
      setLoading(true);
      const topics = await sessionApi.getTopics(sessionId);
      const foundTopic = topics.find((t) => t.id === topicId);
      setTopic(foundTopic || null);
    } catch (error) {
      console.error('Failed to load topic detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      setLoadingMessages(true);
      const response = await sessionApi.getMessages(sessionId, {
        topic_id: topicId,
        page: 1,
        size: 100,
      });
      setMessages(response.items);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      await sessionApi.createMessage(sessionId, {
        session_id: sessionId,
        topic_id: topicId,
        role: 'user',
        parts: [
          {
            type: 'text',
            content,
          },
        ],
      });
      await loadMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (confirm('确定要删除这条消息吗？')) {
      try {
        await sessionApi.deleteMessage(messageId);
        await loadMessages();
      } catch (error) {
        console.error('Failed to delete message:', error);
      }
    }
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
        </CardContent>
      </Card>
    );
  }

  if (!topic) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">话题不存在</p>
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
              <Button variant="ghost" size="icon-sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Hash className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-2xl">{topic.name || '未命名话题'}</CardTitle>
            </div>
            <CardDescription>话题 ID: {topic.id}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(topic)}>
              <Edit className="h-4 w-4 mr-2" />
              编辑
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDelete(topic.id)}>
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
            <Hash className="h-4 w-4" />
            基本信息
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">话题名称</p>
              <p className="font-medium">{topic.name || '未命名话题'}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">所属会话</p>
              <p className="font-medium font-mono text-xs">{topic.session_id}</p>
            </div>
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
              <p className="font-medium">{formatDateTime(topic.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">更新时间</p>
              <p className="font-medium">{formatDateTime(topic.updated_at)}</p>
            </div>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="space-y-3 flex-1 flex flex-col">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            消息列表 ({messages.length})
          </h3>
          
          {loadingMessages ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[400px] pr-2">
              <MessageList messages={messages} onDelete={handleDeleteMessage} />
            </div>
          )}

          {/* 消息输入 */}
          <div className="pt-4 border-t">
            <MessageInput onSend={handleSendMessage} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
