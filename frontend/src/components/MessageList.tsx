import { useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash, Copy, RotateCw, User, Bot, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/api';

interface MessageListProps {
  messages: Message[];
  onDelete: (messageId: string) => void;
}

export function MessageList({ messages, onDelete }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!messages.length) return null;

  return (
    <div className="flex flex-col space-y-4 px-4 py-4">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} onDelete={onDelete} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageItem({ message, onDelete }: { message: Message; onDelete: (id: string) => void }) {
  const isUser = message.role === 'pm' || message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={cn("flex w-full gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border",
        isUser ? "bg-muted" : "bg-primary/10"
      )}>
        {isUser ? <User className="h-4 w-4" /> : isSystem ? <Monitor className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      
      <div className={cn(
        "group relative flex max-w-[80%] flex-col gap-2",
        isUser ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "rounded-lg px-4 py-2 text-sm shadow-sm",
          isUser 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted text-foreground border"
        )}>
          {message.parts.map((part, index) => (
            <div key={index} className="break-words whitespace-pre-wrap">
              {part.type === 'text' && part.content}
              {part.type === 'image' && (
                <img 
                  src={part.content} 
                  alt="content" 
                  className="max-w-full rounded-md mt-2"
                />
              )}
              {part.type === 'url' && (
                <a 
                  href={part.content} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline break-all"
                >
                  {part.content}
                </a>
              )}
              {part.type === 'json' && (
                <pre className="mt-2 overflow-x-auto rounded bg-black/10 p-2 text-xs">
                  {part.content}
                </pre>
              )}
            </div>
          ))}
        </div>
        
        <div className={cn(
          "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
          isUser ? "flex-row-reverse" : "flex-row"
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              const text = message.parts.map(p => p.content).join('\n');
              navigator.clipboard.writeText(text);
            }}
            title="复制"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onDelete(message.id)}
            title="删除"
          >
            <Trash className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
