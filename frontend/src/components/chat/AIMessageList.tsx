/**
 * AI Message List Component
 *
 * Renders the chat message list with streaming support
 */

import { useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { useAIChat } from '@/hooks/useAIChat';
import { StreamingMessage } from './StreamingMessage';
import { ToolCallIndicator } from './ToolCallIndicator';
import { ThinkingPart } from './ThinkingPart';
import { ToolCallPart } from './ToolCallPart';
import { ErrorPart } from './ErrorPart';
import { RegenerateButton } from './RegenerateButton';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';
import type { Message, MessagePart } from '@/lib/api';
import { parseToolCallContent } from '@/lib/api';

export function AIMessageList({ className }: { className?: string }) {
  const { 
    currentSessionId, 
    currentTopicId, 
    messages, 
    streamingMessageId,
    streamingThinking,
    isThinking,
  } = useChatStore();
  const { activeToolCall } = useAIChat();

  const topicKey = currentTopicId || currentSessionId;
  const messageList = topicKey ? (messages[topicKey] || []) : [];

  return (
    <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", className)}>
      {messageList.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={message.id === streamingMessageId}
          streamingThinking={streamingThinking}
          isThinking={isThinking}
        />
      ))}

      {/* Tool call indicator (流式中) */}
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

interface MessageItemProps {
  message: Message;
  isStreaming: boolean;
  streamingThinking: string;
  isThinking: boolean;
}

function MessageItem({
  message,
  isStreaming,
  streamingThinking,
  isThinking,
}: MessageItemProps) {
  const isUser = message.role === 'user' || message.role === 'self';
  const isAssistant = message.role === 'assistant';

  // 组织 parts：保持原始顺序，但配对 tool_call 和 tool_result
  const organizedParts = useMemo(() => {
    if (!isAssistant) return [];

    const result: Array<{
      type: 'thinking' | 'tool_pair' | 'text' | 'error';
      data: any;
    }> = [];

    // 创建 tool_call 到 tool_result 的映射
    const toolResultMap = new Map<string, MessagePart>();
    for (const part of message.parts) {
      if (part.type === 'tool_result') {
        try {
          const resultData = JSON.parse(part.content);
          if (resultData.call_id) {
            toolResultMap.set(resultData.call_id, part);
          }
        } catch {
          // ignore
        }
      }
    }

    // 按原始顺序处理 parts
    const processedToolCalls = new Set<string>();
    
    for (const part of message.parts) {
      switch (part.type) {
        case 'thinking':
          result.push({ type: 'thinking', data: part });
          break;
          
        case 'tool_call':
          try {
            const callContent = parseToolCallContent(part);
            if (callContent && !processedToolCalls.has(callContent.call_id)) {
              processedToolCalls.add(callContent.call_id);
              const resultPart = toolResultMap.get(callContent.call_id);
              result.push({
                type: 'tool_pair',
                data: { call: part, result: resultPart }
              });
            }
          } catch {
            // ignore
          }
          break;
          
        case 'tool_result':
          // tool_result 已经在 tool_call 中处理了，跳过
          break;
          
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

  // 获取发送者名称
  const getSenderName = () => {
    if (message.sender?.name) {
      return message.sender.name;
    }
    if (message.parts[0]?.metadata?.sender_name) {
      return message.parts[0].metadata.sender_name;
    }
    if (isUser) return '我';
    if (isAssistant) return 'AI';
    return '未知用户';
  };

  const senderName = getSenderName();

  // 用户消息
  if (isUser) {
    const textContent = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('');

    return (
      <div className="flex gap-3 flex-row-reverse">
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border bg-muted">
          <User className="h-4 w-4" />
        </div>

        {/* Message content */}
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

  // AI 消息
  if (isAssistant) {
    // 检查是否有文本内容（用于显示 regenerate 按钮）
    const hasTextContent = organizedParts.some(p => p.type === 'text');

    return (
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border bg-primary/10">
          <Bot className="h-4 w-4" />
        </div>

        {/* Message content */}
        <div className="flex flex-col max-w-[80%]">
          <div className="text-xs text-muted-foreground px-1 mb-1">
            {senderName}
          </div>

          {/* 按原始顺序渲染所有 parts */}
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

          {/* 流式中的思考内容 */}
          {isStreaming && isThinking && streamingThinking && (
            <ThinkingPart
              part={{
                id: `${message.id}-thinking-streaming`,
                message_id: message.id,
                type: 'thinking',
                content: streamingThinking,
                created_at: new Date().toISOString(),
              }}
              isStreaming={true}
            />
          )}

          {/* Actions for AI messages */}
          {!isStreaming && hasTextContent && (
            <div className="flex gap-1 mt-1">
              <RegenerateButton messageId={message.id} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 其他角色消息
  return null;
}
