/**
 * AI Message List Component
 *
 * Renders the chat message list with streaming support
 */

import { useChatStore } from '@/store/chat';
import { useAIChat } from '@/hooks/useAIChat';
import { StreamingMessage } from './StreamingMessage';
import { ToolCallIndicator } from './ToolCallIndicator';
import { RegenerateButton } from './RegenerateButton';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

export function AIMessageList({ className }: { className?: string }) {
  const { currentSessionId, currentTopicId, messages, streamingMessageId } = useChatStore();
  const { activeToolCall } = useAIChat();

  const topicKey = currentTopicId || currentSessionId;
  const messageList = topicKey ? (messages[topicKey] || []) : [];

  return (
    <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", className)}>
      {messageList.map((message) => {
        // user 和 self 角色显示在右侧（用户侧）
        // assistant 和 null 角色显示在左侧（对方侧）
        const isUserSide = message.role === 'user' || message.role === 'self';
        const isAssistant = message.role === 'assistant';
        const isCurrentStreaming = message.id === streamingMessageId;
        const content = message.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.content)
          .join('');

        return (
          <div
            key={message.id}
            className={cn(
              'flex gap-3',
              isUserSide && 'flex-row-reverse'
            )}
          >
            {/* Avatar */}
            <div className={cn(
              "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border",
              isUserSide ? "bg-muted" : "bg-primary/10"
            )}>
              {isUserSide ? (
                <User className="h-4 w-4" />
              ) : isAssistant ? (
                <Bot className="h-4 w-4" />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>

            {/* Message content */}
            <div
              className={cn(
                'flex flex-col max-w-[80%]',
                isUserSide && 'items-end'
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-2',
                  isUserSide
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                {isUserSide ? (
                  <p className="whitespace-pre-wrap">{content}</p>
                ) : (
                  <StreamingMessage
                    content={content}
                    isStreaming={isCurrentStreaming}
                  />
                )}
              </div>

              {/* Actions for AI messages */}
              {isAssistant && !isCurrentStreaming && (
                <div className="flex gap-1 mt-1">
                  <RegenerateButton messageId={message.id} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Tool call indicator */}
      {activeToolCall && (
        <div className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border bg-primary/10">
            <Bot className="h-4 w-4" />
          </div>
          <ToolCallIndicator
            name={activeToolCall.name}
            args={activeToolCall.args}
            status="calling"
            className="max-w-[80%]"
          />
        </div>
      )}

      {/* Empty state */}
      {messageList.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Bot className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">Start a conversation</p>
          <p className="text-sm">Ask me anything!</p>
        </div>
      )}
    </div>
  );
}
