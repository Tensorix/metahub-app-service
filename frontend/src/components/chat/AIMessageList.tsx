/**
 * AI Message List Component
 *
 * Renders the chat message list with streaming support.
 * Single data source: message.parts[] — no parallel state.
 */

import { useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { StreamingMessage } from './StreamingMessage';
import { ThinkingPart } from './ThinkingPart';
import { ToolCallPart } from './ToolCallPart';
import { SubAgentCallPart } from './SubAgentCallPart';
import { ErrorPart } from './ErrorPart';
import { RegenerateButton } from './RegenerateButton';
import { FloatingTodo } from './TodoVisualization';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import type { Message, MessagePart, SubAgentCallContent } from '@/lib/api';
import { parseToolCallContent, parseToolResultContent } from '@/lib/api';

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2 px-4 rounded-lg bg-muted w-fit">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export function AIMessageList({ className }: { className?: string }) {
  const {
    currentSessionId,
    currentTopicId,
    messages,
    isStreaming: storeIsStreaming,
    streamingMessageId,
    isThinking,
  } = useChatStore();

  const topicKey = currentTopicId || currentSessionId;
  const messageList = topicKey ? (messages[topicKey] || []) : [];

  return (
    <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", className)}>
      <FloatingTodo messages={messageList} isStreaming={storeIsStreaming} />

      {messageList.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={message.id === streamingMessageId}
          isThinking={isThinking}
        />
      ))}

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

interface MessageItemProps {
  message: Message;
  isStreaming: boolean;
  isThinking: boolean;
}

function MessageItem({ message, isStreaming, isThinking }: MessageItemProps) {
  const isUser = message.role === 'user' || message.role === 'self';
  const isAssistant = message.role === 'assistant';

  // Organize parts: preserve original order, pair tool_call with tool_result
  const organizedParts = useMemo(() => {
    if (!isAssistant) return [];

    const result: Array<{
      type: 'thinking' | 'tool_pair' | 'tool_result_orphan' | 'subagent_call' | 'text' | 'error';
      data: any;
    }> = [];

    // Build tool_call → tool_result map
    const toolResultMap = new Map<string, MessagePart>();
    for (const part of message.parts) {
      if (part.type === 'tool_result') {
        try {
          const resultData = JSON.parse(part.content);
          if (resultData.op_id) {
            toolResultMap.set(resultData.op_id, part);
          }
        } catch { /* ignore */ }
      }
    }

    const processedToolCalls = new Set<string>();

    for (const part of message.parts) {
      switch (part.type) {
        case 'thinking':
          result.push({ type: 'thinking', data: part });
          break;

        case 'tool_call': {
          try {
            const callContent = parseToolCallContent(part);
            if (callContent && !processedToolCalls.has(callContent.op_id)) {
              processedToolCalls.add(callContent.op_id);
              const resultPart = toolResultMap.get(callContent.op_id);
              result.push({ type: 'tool_pair', data: { call: part, result: resultPart } });
            }
          } catch { /* ignore */ }
          break;
        }

        case 'tool_result': {
          try {
            const resultContent = parseToolResultContent(part);
            if (resultContent && !processedToolCalls.has(resultContent.op_id)) {
              result.push({ type: 'tool_result_orphan', data: resultContent });
            }
          } catch { /* ignore */ }
          break;
        }

        case 'subagent_call': {
          try {
            const parsed: any = JSON.parse(part.content);
            const saData: SubAgentCallContent = {
              ...parsed,
              op_id: parsed.op_id || parsed.call_id,
            };
            result.push({ type: 'subagent_call', data: saData });
          } catch { /* ignore */ }
          break;
        }

        case 'text':
          result.push({ type: 'text', data: part });
          break;

        case 'error':
          result.push({ type: 'error', data: part });
          break;
      }
    }

    return result;
  }, [message.parts, isAssistant]);

  const getSenderName = () => {
    if (message.sender?.name) return message.sender.name;
    if (message.parts[0]?.metadata?.sender_name) return message.parts[0].metadata.sender_name;
    if (isUser) return '我';
    if (isAssistant) return 'AI';
    return '未知用户';
  };

  const senderName = getSenderName();

  // User message
  if (isUser) {
    const textContent = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('');

    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border bg-muted">
          <User className="h-4 w-4" />
        </div>
        <div className="flex flex-col max-w-[80%] items-end">
          <div className="text-xs text-muted-foreground px-1 mb-1 text-right">
            {senderName}
          </div>
          <div className="rounded-lg px-4 py-2 bg-primary text-primary-foreground">
            <p className="whitespace-pre-wrap">{textContent}</p>
          </div>
        </div>
      </div>
    );
  }

  // AI message
  if (isAssistant) {
    const hasTextContent = organizedParts.some(p => p.type === 'text');
    const showLoadingDots = isStreaming && organizedParts.length === 0;

    return (
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border bg-primary/10">
          <Bot className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <span className="text-xs text-muted-foreground">{senderName}</span>

          {showLoadingDots && <LoadingDots />}

          {organizedParts.map((item, index) => {
            switch (item.type) {
              case 'thinking':
                return (
                  <ThinkingPart
                    key={`thinking-${index}`}
                    part={item.data}
                    isStreaming={isStreaming && isThinking}
                  />
                );

              case 'tool_pair':
                return (
                  <ToolCallPart
                    key={`tool-${item.data.call.id}`}
                    callPart={item.data.call}
                    resultPart={item.data.result}
                  />
                );

              case 'subagent_call':
                return (
                  <SubAgentCallPart
                    key={`subagent-${item.data.op_id}`}
                    data={item.data}
                    isStreaming={isStreaming}
                  />
                );

              case 'tool_result_orphan':
                return (
                  <div key={`tool-orphan-${index}`} className="my-1.5 rounded-lg border px-3 py-2 bg-muted/20">
                    <div className="text-xs text-muted-foreground mb-1">Tool Result (Unmatched)</div>
                    <div className="text-sm font-medium mb-1">{item.data.name}</div>
                    <pre className="text-xs whitespace-pre-wrap break-words">{item.data.result}</pre>
                  </div>
                );

              case 'text':
                return (
                  <div key={`text-${index}`} className="rounded-lg px-4 py-2 bg-muted">
                    <StreamingMessage
                      content={item.data.content}
                      isStreaming={isStreaming}
                    />
                  </div>
                );

              case 'error':
                return <ErrorPart key={`error-${index}`} part={item.data} />;

              default:
                return null;
            }
          })}

          {!isStreaming && hasTextContent && (
            <div className="flex gap-1 mt-1">
              <RegenerateButton messageId={message.id} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
