/**
 * AI Message List Component
 *
 * Renders the chat message list with streaming support.
 * Single data source: message.parts[] — no parallel state.
 */

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useChatStore } from '@/store/chat';
import { StreamingMessage } from './StreamingMessage';
import { ThinkingPart } from './ThinkingPart';
import { ToolCallPart } from './ToolCallPart';
import { SubAgentCallPart } from './SubAgentCallPart';
import { ErrorPart } from './ErrorPart';
import { MetricsPart } from './MetricsPart';
import { RegenerateButton } from './RegenerateButton';
import { FloatingTodo } from './TodoVisualization';
import { LoadingDots } from './LoadingDots';
import { cn } from '@/lib/utils';
import { Bot, Monitor, User } from 'lucide-react';
import type { Message, MessagePart, SubAgentCallContent } from '@/lib/api';
import { parseToolCallContent, parseToolResultContent } from '@/lib/api';
import { staggerContainer, listItem, slideInLeft, slideInRight, fadeUp } from '@/lib/motion';

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

  console.debug('[AIMessageList] render', { topicKey, msgCount: messageList.length, isStreaming: storeIsStreaming, streamingMsgId: streamingMessageId, msgs: messageList.map(m => ({ id: m.id?.slice(-8), role: m.role, parts: m.parts?.length })) });

  return (
    <div className={cn("flex-1 overflow-y-auto p-4", className)}>
      <div className="max-w-3xl mx-auto space-y-4">
        <FloatingTodo messages={messageList} isStreaming={storeIsStreaming} />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {messageList.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              isStreaming={message.id === streamingMessageId}
              isThinking={isThinking}
            />
          ))}
        </motion.div>

        {messageList.length === 0 && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-center justify-center h-full text-center text-muted-foreground"
          >
            <motion.div
              variants={fadeUp}
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Bot className="h-12 w-12 mb-4" />
            </motion.div>
            <motion.p variants={fadeUp} className="text-lg font-medium">开始对话</motion.p>
            <motion.p variants={fadeUp} className="text-sm">随时向我提问</motion.p>
          </motion.div>
        )}
      </div>
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
  const isSystemLike = message.role === 'system' || message.role === 'null';

  // Organize parts: preserve original order, pair tool_call with tool_result
  const organizedParts = useMemo(() => {
    if (!isAssistant) return [];

    const result: Array<{
      type: 'thinking' | 'tool_pair' | 'tool_result_orphan' | 'subagent_call' | 'text' | 'error' | 'metrics';
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

        case 'metrics':
          result.push({ type: 'metrics', data: part });
          break;
      }
    }

    return result;
  }, [message.parts, isAssistant]);

  if (isAssistant) {
    console.debug('[MessageItem]', message.id?.slice(-8), 'rawParts:', message.parts?.length, message.parts?.map(p => `${p.type}:${p.content?.slice(0, 30)}`), 'organized:', organizedParts.length, organizedParts.map(p => p.type));
  }

  const getSenderName = () => {
    if (message.sender?.name) return message.sender.name;
    if (message.parts[0]?.metadata?.sender_name) return message.parts[0].metadata.sender_name;
    if (isUser) return '我';
    if (isAssistant) return 'AI';
    if (isSystemLike) return '系统';
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
      <motion.div variants={listItem} initial="hidden" animate="visible">
        <motion.div variants={slideInRight} initial="hidden" animate="visible" className="flex gap-3 flex-row-reverse">
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-brand/8 text-brand">
          <User className="h-4 w-4" />
        </div>
        <div className="flex flex-col max-w-[80%] items-end">
          <div className="text-xs text-muted-foreground px-1 mb-1 text-right">
            {senderName}
          </div>
          <div className="rounded-2xl rounded-tr-md px-4 py-2.5 bg-primary text-primary-foreground">
            <p className="whitespace-pre-wrap">{textContent}</p>
          </div>
        </div>
        </motion.div>
      </motion.div>
    );
  }

  // AI message
  if (isAssistant) {
    const hasTextContent = organizedParts.some(
      (p) => p.type === 'text' && !!p.data?.content?.trim(),
    );
    const showLoadingDots = isStreaming && organizedParts.length === 0;
    const hasRenderablePart = organizedParts.some((item) => {
      if (item.type === 'text') return !!item.data?.content?.trim();
      return true;
    });

    return (
      <motion.div variants={listItem} initial="hidden" animate="visible">
        <motion.div variants={slideInLeft} initial="hidden" animate="visible" className="group flex gap-3">
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-brand/8 text-brand">
          <Bot className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <span className="text-xs text-muted-foreground">{senderName}</span>

          {showLoadingDots && (
            <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-surface w-fit">
              <LoadingDots size="md" />
            </div>
          )}

            {!showLoadingDots && !hasRenderablePart && (
              <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-surface text-xs text-muted-foreground">
                等待内容...
              </div>
            )}

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
                if (!item.data.content?.trim()) return null;
                return (
                  <div key={`text-${index}`} className="rounded-2xl rounded-tl-md px-4 py-3 bg-surface">
                    <StreamingMessage
                      content={item.data.content}
                      isStreaming={isStreaming}
                    />
                  </div>
                );

              case 'error':
                return <ErrorPart key={`error-${index}`} part={item.data} />;

              case 'metrics':
                return <MetricsPart key={`metrics-${index}`} part={item.data} />;

              default:
                return null;
            }
          })}

          {!isStreaming && hasTextContent && (
            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <RegenerateButton messageId={message.id} />
            </div>
          )}
        </div>
        </motion.div>
      </motion.div>
    );
  }

  const fallbackContent = message.parts
    .map((part) => (part.type === 'text' ? part.content : `[${part.type}] ${part.content}`))
    .join('\n')
    .trim();

  return (
    <motion.div variants={listItem} initial="hidden" animate="visible">
      <motion.div variants={slideInLeft} initial="hidden" animate="visible" className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-brand/8 text-brand">
          <Monitor className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <span className="text-xs text-muted-foreground">{senderName}</span>
          <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-surface">
            <p className="whitespace-pre-wrap text-sm">
              {fallbackContent || '该消息暂不支持当前渲染类型'}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
