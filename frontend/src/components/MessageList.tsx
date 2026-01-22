import type { Message } from '@/lib/api';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  User, 
  Bot, 
  Trash2,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
  onDelete: (messageId: string) => void;
}

export function MessageList({ messages, onDelete }: MessageListProps) {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'assistant':
        return <Bot className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      user: '用户',
      assistant: '助手',
      system: '系统',
    };
    return roleMap[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colorMap: Record<string, string> = {
      user: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      assistant: 'bg-green-500/10 text-green-500 border-green-500/20',
      system: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    };
    return colorMap[role] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  };

  const getPartIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="h-3 w-3" />;
      case 'url':
        return <LinkIcon className="h-3 w-3" />;
      case 'at':
        return <User className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderPartContent = (part: Message['parts'][0]) => {
    switch (part.type) {
      case 'image':
        return (
          <div className="mt-2">
            <img 
              src={part.content} 
              alt="消息图片" 
              className="max-w-xs rounded-md border"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E图片加载失败%3C/text%3E%3C/svg%3E';
              }}
            />
          </div>
        );
      case 'url':
        return (
          <a 
            href={part.content} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            <LinkIcon className="h-3 w-3" />
            {part.content}
          </a>
        );
      case 'json':
        return (
          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(JSON.parse(part.content), null, 2)}
          </pre>
        );
      case 'at':
        return <p className="whitespace-pre-wrap break-words text-primary">{part.content}</p>;
      case 'text':
      default:
        return <p className="whitespace-pre-wrap break-words">{part.content}</p>;
    }
  };

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>暂无消息</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <Card
          key={message.id}
          className={cn(
            'p-4 transition-all hover:shadow-sm',
            message.role === 'user' ? 'ml-8' : 'mr-8'
          )}
        >
          <div className="flex items-start gap-3">
            {/* 角色图标 */}
            <div className={cn(
              'mt-1 p-2 rounded-full',
              getRoleColor(message.role)
            )}>
              {getRoleIcon(message.role)}
            </div>

            {/* 消息内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant="outline"
                  className={cn('text-xs', getRoleColor(message.role))}
                >
                  {getRoleLabel(message.role)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatTime(message.created_at)}
                </span>
              </div>

              {/* 消息部分 */}
              <div className="space-y-2">
                {message.parts.map((part) => (
                  <div key={part.id} className="text-sm">
                    {part.type !== 'text' && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        {getPartIcon(part.type)}
                        <span>{part.type}</span>
                      </div>
                    )}
                    {renderPartContent(part)}
                  </div>
                ))}
              </div>
            </div>

            {/* 删除按钮 */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDelete(message.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
