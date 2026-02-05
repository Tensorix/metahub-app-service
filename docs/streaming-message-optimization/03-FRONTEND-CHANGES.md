# 前端改动

## 1. 类型定义更新

### 1.1 文件: `frontend/src/lib/api.ts`

```typescript
// ========== MessagePart 类型扩展 ==========

export type MessagePartType =
  | 'text'
  | 'image'
  | 'at'
  | 'url'
  | 'json'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'thinking';

export interface MessagePart {
  id: string;
  message_id: string;
  type: MessagePartType;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ========== AI Part 内容解析类型 ==========

export interface ToolCallContent {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultContent {
  call_id: string;
  name: string;
  result: string;
  success: boolean;
}

export interface ErrorContent {
  error: string;
  code?: string;
  recoverable?: boolean;
}

export interface ThinkingContent {
  content: string;
  timestamp?: string;
}

// ========== 类型守卫函数 ==========

export function isToolCallPart(part: MessagePart): boolean {
  return part.type === 'tool_call';
}

export function isToolResultPart(part: MessagePart): boolean {
  return part.type === 'tool_result';
}

export function isErrorPart(part: MessagePart): boolean {
  return part.type === 'error';
}

export function isThinkingPart(part: MessagePart): boolean {
  return part.type === 'thinking';
}

export function isTextPart(part: MessagePart): boolean {
  return part.type === 'text';
}

// ========== Part 内容解析函数 ==========

export function parseToolCallContent(part: MessagePart): ToolCallContent | null {
  if (part.type !== 'tool_call') return null;
  try {
    return JSON.parse(part.content) as ToolCallContent;
  } catch {
    return null;
  }
}

export function parseToolResultContent(part: MessagePart): ToolResultContent | null {
  if (part.type !== 'tool_result') return null;
  try {
    return JSON.parse(part.content) as ToolResultContent;
  } catch {
    return null;
  }
}

export function parseErrorContent(part: MessagePart): ErrorContent | null {
  if (part.type !== 'error') return null;
  try {
    return JSON.parse(part.content) as ErrorContent;
  } catch {
    return null;
  }
}
```

### 1.2 文件: `frontend/src/lib/agentApi.ts`

```typescript
// 更新 ChatEvent 接口以支持 call_id 和 thinking
export interface ChatEvent {
  event: 'message' | 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: {
    content?: string;        // message/thinking 事件
    name?: string;           // tool_call/tool_result
    args?: Record<string, unknown>;  // tool_call
    result?: string;         // tool_result
    call_id?: string;        // tool_call/tool_result
    success?: boolean;       // tool_result
    error?: string;          // error 事件
    code?: string;           // error 事件
    status?: string;         // done 事件
  };
}
```

---

## 2. Store 改动

### 2.1 文件: `frontend/src/store/chat.ts`

#### 2.1.1 新增状态字段

```typescript
interface ChatState {
  // ... 现有字段 ...

  // ===== AI 对话状态（扩展） =====
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  abortController: AbortController | null;

  // 当前活动的工具调用（用于 UI 显示）
  activeToolCall: {
    call_id: string;
    name: string;
    args: Record<string, unknown>;
  } | null;

  // 思考内容（新增）
  streamingThinking: string;
  isThinking: boolean;

  // 流式过程中收集的 Parts（新增）
  pendingParts: Array<{
    type: 'thinking' | 'tool_call' | 'tool_result' | 'error';
    content: string;  // JSON string or plain text
    metadata?: Record<string, unknown>;
  }>;

  streamError: string | null;

  // ... 现有方法 ...
}
```

#### 2.1.2 初始状态更新

```typescript
export const useChatStore = create<ChatState>((set, get) => ({
  // ... 现有初始状态 ...

  // AI 对话初始状态（更新）
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: '',
  streamingThinking: '',  // 新增
  isThinking: false,      // 新增
  abortController: null,
  activeToolCall: null,
  pendingParts: [],
  streamError: null,

  // ... 其他代码 ...
}));
```

#### 2.1.3 修改 `sendAIMessage` 方法

```typescript
sendAIMessage: async (content: string) => {
  const { currentSessionId, currentTopicId, sessions } = get();

  if (!currentSessionId) {
    set({ streamError: 'No session selected' });
    return;
  }

  const session = sessions.find((s) => s.id === currentSessionId);
  if (!session || session.type !== 'ai') {
    set({ streamError: 'Not an AI session' });
    return;
  }

  const controller = new AbortController();
  const userMessageId = `temp-user-${Date.now()}`;
  const aiMessageId = `temp-ai-${Date.now()}`;

  // 获取或创建 topic
  let topicId = currentTopicId;
  if (!topicId) {
    const topicName = content.length > 30 ? `${content.slice(0, 30)}...` : content;
    const newTopic = await get().createTopic(currentSessionId, topicName);
    topicId = newTopic.id;
    set({ currentTopicId: topicId });
  }

  // 创建用户消息
  const userMessage: Message = {
    id: userMessageId,
    session_id: currentSessionId,
    topic_id: topicId || undefined,
    role: 'user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
    parts: [{
      id: `${userMessageId}-part`,
      message_id: userMessageId,
      type: 'text',
      content,
      created_at: new Date().toISOString()
    }],
  };

  // 创建空的 AI 消息占位（支持多 Part）
  const aiMessage: Message = {
    id: aiMessageId,
    session_id: currentSessionId,
    topic_id: topicId || undefined,
    role: 'assistant',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
    parts: [],  // 初始为空，动态添加
  };

  set((state) => {
    const topicKey = topicId || currentSessionId;
    const currentMessages = state.messages[topicKey] || [];
    return {
      messages: {
        ...state.messages,
        [topicKey]: [...currentMessages, userMessage, aiMessage],
      },
      isStreaming: true,
      streamingMessageId: aiMessageId,
      streamingContent: '',
      abortController: controller,
      streamError: null,
      activeToolCall: null,
      streamingThinking: '',  // 重置
      isThinking: false,
      pendingParts: [],
    };
  });

  try {
    let currentCallId: string | null = null;

    for await (const event of chatWithAgentStream(
      currentSessionId,
      content,
      {
        topicId: topicId || undefined,
        signal: controller.signal,
      }
    )) {
      switch (event.event) {
        case 'message':
          set((state) => {
            const newContent = state.streamingContent + (event.data.content || '');

            // 更新消息的 text part
            const topicKey = topicId || currentSessionId;
            const currentMessages = state.messages[topicKey] || [];
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === state.streamingMessageId
            );

            if (msgIndex !== -1) {
              const updatedMessages = [...currentMessages];
              const message = { ...updatedMessages[msgIndex] };

              // 找到或创建 text part
              let textPartIndex = message.parts.findIndex(p => p.type === 'text');
              if (textPartIndex === -1) {
                // 创建新的 text part
                message.parts = [
                  ...message.parts,
                  {
                    id: `${message.id}-text`,
                    message_id: message.id,
                    type: 'text',
                    content: newContent,
                    created_at: new Date().toISOString(),
                  }
                ];
              } else {
                // 更新现有 text part
                message.parts = message.parts.map((p, i) =>
                  i === textPartIndex ? { ...p, content: newContent } : p
                );
              }

              updatedMessages[msgIndex] = message;

              return {
                streamingContent: newContent,
                messages: {
                  ...state.messages,
                  [topicKey]: updatedMessages,
                },
              };
            }
            return { streamingContent: newContent };
          });
          break;

        case 'thinking':
          set((state) => {
            const newThinking = state.streamingThinking + (event.data.content || '');

            // 更新消息的 thinking part
            const topicKey = topicId || currentSessionId;
            const currentMessages = state.messages[topicKey] || [];
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === state.streamingMessageId
            );

            if (msgIndex !== -1) {
              const updatedMessages = [...currentMessages];
              const message = { ...updatedMessages[msgIndex] };

              // 找到或创建 thinking part
              let thinkingPartIndex = message.parts.findIndex(p => p.type === 'thinking');
              if (thinkingPartIndex === -1) {
                message.parts = [
                  {
                    id: `${message.id}-thinking`,
                    message_id: message.id,
                    type: 'thinking',
                    content: newThinking,
                    created_at: new Date().toISOString(),
                  },
                  ...message.parts,
                ];
              } else {
                message.parts = message.parts.map((p, i) =>
                  i === thinkingPartIndex ? { ...p, content: newThinking } : p
                );
              }

              updatedMessages[msgIndex] = message;

              return {
                streamingThinking: newThinking,
                isThinking: true,
                messages: {
                  ...state.messages,
                  [topicKey]: updatedMessages,
                },
              };
            }
            return { streamingThinking: newThinking, isThinking: true };
          });
          break;

        case 'tool_call':
          currentCallId = event.data.call_id || `call_${Date.now()}`;

          set((state) => {
            const toolCallPart = {
              type: 'tool_call' as const,
              content: JSON.stringify({
                call_id: currentCallId,
                name: event.data.name,
                args: event.data.args,
              }),
              metadata: { timestamp: new Date().toISOString() },
            };

            // 更新消息 parts
            const topicKey = topicId || currentSessionId;
            const currentMessages = state.messages[topicKey] || [];
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === state.streamingMessageId
            );

            if (msgIndex !== -1) {
              const updatedMessages = [...currentMessages];
              const message = { ...updatedMessages[msgIndex] };
              message.parts = [
                ...message.parts,
                {
                  id: `${message.id}-tc-${currentCallId}`,
                  message_id: message.id,
                  type: 'tool_call',
                  content: toolCallPart.content,
                  metadata: toolCallPart.metadata,
                  created_at: new Date().toISOString(),
                }
              ];
              updatedMessages[msgIndex] = message;

              return {
                activeToolCall: {
                  call_id: currentCallId!,
                  name: event.data.name || '',
                  args: event.data.args || {},
                },
                pendingParts: [...state.pendingParts, toolCallPart],
                messages: {
                  ...state.messages,
                  [topicKey]: updatedMessages,
                },
              };
            }

            return {
              activeToolCall: {
                call_id: currentCallId!,
                name: event.data.name || '',
                args: event.data.args || {},
              },
              pendingParts: [...state.pendingParts, toolCallPart],
            };
          });
          break;

        case 'tool_result':
          set((state) => {
            const resultCallId = event.data.call_id || currentCallId;
            const toolResultPart = {
              type: 'tool_result' as const,
              content: JSON.stringify({
                call_id: resultCallId,
                name: event.data.name,
                result: event.data.result,
                success: event.data.success ?? true,
              }),
              metadata: { timestamp: new Date().toISOString() },
            };

            // 更新消息 parts
            const topicKey = topicId || currentSessionId;
            const currentMessages = state.messages[topicKey] || [];
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === state.streamingMessageId
            );

            if (msgIndex !== -1) {
              const updatedMessages = [...currentMessages];
              const message = { ...updatedMessages[msgIndex] };
              message.parts = [
                ...message.parts,
                {
                  id: `${message.id}-tr-${resultCallId}`,
                  message_id: message.id,
                  type: 'tool_result',
                  content: toolResultPart.content,
                  metadata: toolResultPart.metadata,
                  created_at: new Date().toISOString(),
                }
              ];
              updatedMessages[msgIndex] = message;

              return {
                activeToolCall: null,
                pendingParts: [...state.pendingParts, toolResultPart],
                messages: {
                  ...state.messages,
                  [topicKey]: updatedMessages,
                },
              };
            }

            return {
              activeToolCall: null,
              pendingParts: [...state.pendingParts, toolResultPart],
            };
          });
          currentCallId = null;
          break;

        case 'error':
          set((state) => {
            const errorPart = {
              type: 'error' as const,
              content: JSON.stringify({
                error: event.data.error,
                code: event.data.code,
              }),
              metadata: { timestamp: new Date().toISOString() },
            };

            // 更新消息 parts
            const topicKey = topicId || currentSessionId;
            const currentMessages = state.messages[topicKey] || [];
            const msgIndex = currentMessages.findIndex(
              (m) => m.id === state.streamingMessageId
            );

            if (msgIndex !== -1) {
              const updatedMessages = [...currentMessages];
              const message = { ...updatedMessages[msgIndex] };
              message.parts = [
                ...message.parts,
                {
                  id: `${message.id}-err-${Date.now()}`,
                  message_id: message.id,
                  type: 'error',
                  content: errorPart.content,
                  metadata: errorPart.metadata,
                  created_at: new Date().toISOString(),
                }
              ];
              updatedMessages[msgIndex] = message;

              return {
                streamError: event.data.error || 'Unknown error',
                pendingParts: [...state.pendingParts, errorPart],
                messages: {
                  ...state.messages,
                  [topicKey]: updatedMessages,
                },
              };
            }

            return {
              streamError: event.data.error || 'Unknown error',
              pendingParts: [...state.pendingParts, errorPart],
            };
          });
          break;

        case 'done':
          set(() => ({
            isStreaming: false,
            streamingMessageId: null,
            abortController: null,
            activeToolCall: null,
            pendingParts: [],
          }));

          // 刷新消息列表获取真实 ID
          if (topicId) {
            await get().loadMessages(currentSessionId, topicId);
          }
          break;
      }
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      // 用户取消
      set((state) => {
        const topicKey = topicId || currentSessionId;
        const currentMessages = state.messages[topicKey] || [];
        const msgIndex = currentMessages.findIndex(
          (m) => m.id === state.streamingMessageId
        );

        if (msgIndex !== -1) {
          const updatedMessages = [...currentMessages];
          const message = { ...updatedMessages[msgIndex] };

          // 在 text part 后添加取消标记
          const textPartIndex = message.parts.findIndex(p => p.type === 'text');
          if (textPartIndex !== -1) {
            message.parts = message.parts.map((p, i) =>
              i === textPartIndex
                ? { ...p, content: p.content + ' [已取消]' }
                : p
            );
          }

          updatedMessages[msgIndex] = message;

          return {
            isStreaming: false,
            abortController: null,
            activeToolCall: null,
            streamingMessageId: null,
            pendingParts: [],
            messages: {
              ...state.messages,
              [topicKey]: updatedMessages,
            },
          };
        }

        return {
          isStreaming: false,
          abortController: null,
          activeToolCall: null,
          streamingMessageId: null,
          pendingParts: [],
        };
      });
    } else {
      set(() => ({
        isStreaming: false,
        streamError: (error as Error).message,
        abortController: null,
        activeToolCall: null,
        streamingMessageId: null,
        pendingParts: [],
      }));
    }
  }
},
```

#### 2.1.4 更新 `clearStreamState`

```typescript
clearStreamState: () => {
  set({
    isStreaming: false,
    streamingMessageId: null,
    streamingContent: '',
    streamingThinking: '',
    isThinking: false,
    abortController: null,
    activeToolCall: null,
    pendingParts: [],
    streamError: null,
  });
},
```

---

## 3. 组件改动

### 3.1 新增: `ToolCallPart.tsx`

**文件**: `frontend/src/components/chat/ToolCallPart.tsx`

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle } from 'lucide-react';
import type { MessagePart, ToolCallContent, ToolResultContent } from '@/lib/api';
import { parseToolCallContent, parseToolResultContent } from '@/lib/api';

interface ToolCallPartProps {
  callPart: MessagePart;
  resultPart?: MessagePart;
}

export function ToolCallPart({ callPart, resultPart }: ToolCallPartProps) {
  const [expanded, setExpanded] = useState(false);

  const callContent = parseToolCallContent(callPart);
  const resultContent = resultPart ? parseToolResultContent(resultPart) : null;

  if (!callContent) return null;

  const hasResult = !!resultContent;
  const isSuccess = resultContent?.success ?? true;

  return (
    <div className="my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* 头部：可点击展开/折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}

        <Wrench className="w-4 h-4 text-blue-500" />

        <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
          {callContent.name}
        </span>

        {/* 状态指示 */}
        {hasResult ? (
          isSuccess ? (
            <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500 ml-auto" />
          )
        ) : (
          <span className="ml-auto text-xs text-gray-400">执行中...</span>
        )}
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 py-2 text-sm">
          {/* 参数 */}
          <div className="mb-2">
            <div className="text-xs text-gray-500 mb-1">参数:</div>
            <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto">
              {JSON.stringify(callContent.args, null, 2)}
            </pre>
          </div>

          {/* 结果 */}
          {resultContent && (
            <div>
              <div className="text-xs text-gray-500 mb-1">结果:</div>
              <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto max-h-40">
                {resultContent.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 3.2 新增: `ThinkingPart.tsx`

**文件**: `frontend/src/components/chat/ThinkingPart.tsx`

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Loader2 } from 'lucide-react';
import type { MessagePart } from '@/lib/api';

interface ThinkingPartProps {
  part: MessagePart;
  isStreaming?: boolean;
}

export function ThinkingPart({ part, isStreaming = false }: ThinkingPartProps) {
  const [expanded, setExpanded] = useState(false);

  const content = part.content || '';
  const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;

  return (
    <div className="my-2 border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden">
      {/* 头部：可点击展开/折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-purple-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-purple-500" />
        )}

        {isStreaming ? (
          <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
        ) : (
          <Brain className="w-4 h-4 text-purple-500" />
        )}

        <span className="font-medium text-sm text-purple-700 dark:text-purple-300">
          思考过程
        </span>

        {!expanded && (
          <span className="text-xs text-purple-500 ml-auto truncate max-w-[200px]">
            {preview}
          </span>
        )}
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-1" />
          )}
        </div>
      )}
    </div>
  );
}
```

### 3.3 新增: `ErrorPart.tsx`

**文件**: `frontend/src/components/chat/ErrorPart.tsx`

```tsx
import { AlertCircle } from 'lucide-react';
import type { MessagePart, ErrorContent } from '@/lib/api';
import { parseErrorContent } from '@/lib/api';

interface ErrorPartProps {
  part: MessagePart;
}

export function ErrorPart({ part }: ErrorPartProps) {
  const errorContent = parseErrorContent(part);

  if (!errorContent) return null;

  return (
    <div className="my-2 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-sm text-red-700 dark:text-red-400">
          {errorContent.error}
        </div>
        {errorContent.code && (
          <div className="text-xs text-red-500 mt-1">
            错误码: {errorContent.code}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.4 修改: `AIMessageList.tsx`

**文件**: `frontend/src/components/chat/AIMessageList.tsx`

```tsx
import { useMemo } from 'react';
import { StreamingMessage } from './StreamingMessage';
import { ThinkingPart } from './ThinkingPart';
import { ToolCallPart } from './ToolCallPart';
import { ErrorPart } from './ErrorPart';
import { ToolCallIndicator } from './ToolCallIndicator';
import { useChatStore } from '@/store/chat';
import type { Message, MessagePart } from '@/lib/api';
import { parseToolCallContent } from '@/lib/api';

interface AIMessageListProps {
  messages: Message[];
}

export function AIMessageList({ messages }: AIMessageListProps) {
  const {
    streamingMessageId,
    streamingContent,
    streamingThinking,
    isStreaming,
    isThinking,
    activeToolCall,
  } = useChatStore();

  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={isStreaming && message.id === streamingMessageId}
          streamingContent={streamingContent}
          streamingThinking={streamingThinking}
          isThinking={isThinking}
          activeToolCall={activeToolCall}
        />
      ))}
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  isThinking: boolean;
  activeToolCall: { call_id: string; name: string; args: Record<string, unknown> } | null;
}

function MessageItem({
  message,
  isStreaming,
  streamingContent,
  streamingThinking,
  isThinking,
  activeToolCall,
}: MessageItemProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // 组织 parts：将 tool_call 和 tool_result 配对
  const organizedParts = useMemo(() => {
    if (!isAssistant) return { thinkingParts: [], toolPairs: [], textParts: [], errorParts: [] };

    const thinkingParts: MessagePart[] = [];
    const toolCalls: MessagePart[] = [];
    const toolResults: MessagePart[] = [];
    const textParts: MessagePart[] = [];
    const errorParts: MessagePart[] = [];

    for (const part of message.parts) {
      switch (part.type) {
        case 'thinking':
          thinkingParts.push(part);
          break;
        case 'tool_call':
          toolCalls.push(part);
          break;
        case 'tool_result':
          toolResults.push(part);
          break;
        case 'text':
          textParts.push(part);
          break;
        case 'error':
          errorParts.push(part);
          break;
      }
    }

    // 配对 tool_call 和 tool_result
    const toolPairs = toolCalls.map((call) => {
      const callContent = parseToolCallContent(call);
      const result = callContent
        ? toolResults.find((r) => {
            try {
              const resultData = JSON.parse(r.content);
              return resultData.call_id === callContent.call_id;
            } catch {
              return false;
            }
          })
        : undefined;

      return { call, result };
    });

    return { thinkingParts, toolPairs, textParts, errorParts };
  }, [message.parts, isAssistant]);

  // 用户消息
  if (isUser) {
    const textContent = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('');

    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-blue-500 text-white rounded-lg px-4 py-2">
          {textContent}
        </div>
      </div>
    );
  }

  // AI 消息
  if (isAssistant) {
    const { thinkingParts, toolPairs, textParts, errorParts } = organizedParts;

    // 获取文本内容
    const textContent = isStreaming
      ? streamingContent
      : textParts.map((p) => p.content).join('');

    // 获取思考内容
    const thinkingContent = isStreaming && isThinking
      ? streamingThinking
      : thinkingParts.map((p) => p.content).join('');

    return (
      <div className="flex justify-start">
        <div className="max-w-[80%]">
          {/* 思考过程（折叠显示） */}
          {(thinkingContent || (isStreaming && isThinking)) && (
            <ThinkingPart
              part={{
                id: `${message.id}-thinking`,
                message_id: message.id,
                type: 'thinking',
                content: thinkingContent,
                created_at: new Date().toISOString(),
              }}
              isStreaming={isStreaming && isThinking}
            />
          )}

          {/* 工具调用（折叠显示） */}
          {toolPairs.map(({ call, result }) => (
            <ToolCallPart
              key={call.id}
              callPart={call}
              resultPart={result}
            />
          ))}

          {/* 当前活动的工具调用指示器（流式中） */}
          {isStreaming && activeToolCall && (
            <ToolCallIndicator
              name={activeToolCall.name}
              args={activeToolCall.args}
            />
          )}

          {/* 文本内容 */}
          {(textContent || isStreaming) && (
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
              <StreamingMessage
                content={textContent}
                isStreaming={isStreaming}
              />
            </div>
          )}

          {/* 错误信息 */}
          {errorParts.map((part) => (
            <ErrorPart key={part.id} part={part} />
          ))}
        </div>
      </div>
    );
  }

  // 其他角色消息
  return null;
}
```

### 3.4 修改: `ToolCallIndicator.tsx`

**文件**: `frontend/src/components/chat/ToolCallIndicator.tsx`

```tsx
import { Loader2, Wrench } from 'lucide-react';

interface ToolCallIndicatorProps {
  name: string;
  args: Record<string, unknown>;
  status?: 'calling' | 'completed';
}

export function ToolCallIndicator({
  name,
  args,
  status = 'calling',
}: ToolCallIndicatorProps) {
  return (
    <div className="my-2 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      {status === 'calling' ? (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      ) : (
        <Wrench className="w-4 h-4 text-blue-500" />
      )}

      <span className="text-sm text-blue-700 dark:text-blue-400">
        正在调用 <span className="font-medium">{name}</span>
      </span>

      {Object.keys(args).length > 0 && (
        <span className="text-xs text-blue-500 ml-auto">
          {Object.keys(args).length} 个参数
        </span>
      )}
    </div>
  );
}
```

---

## 4. Hook 更新

### 4.1 文件: `frontend/src/hooks/useAIChat.ts`

```typescript
import { useChatStore } from '@/store/chat';

export function useAIChat() {
  const {
    isStreaming,
    streamingContent,
    streamingThinking,
    streamingMessageId,
    isThinking,
    activeToolCall,
    pendingParts,
    streamError,
    sendAIMessage,
    stopGeneration,
    regenerateMessage,
    clearStreamState,
  } = useChatStore();

  return {
    // 状态
    isStreaming,
    streamingContent,
    streamingThinking,
    streamingMessageId,
    isThinking,
    activeToolCall,
    pendingParts,
    error: streamError,

    // 操作
    send: sendAIMessage,
    stop: stopGeneration,
    regenerate: regenerateMessage,
    clearError: () => clearStreamState(),
  };
}
```

---

## 5. 样式建议

### 5.1 工具调用折叠样式

```css
/* 工具调用容器 */
.tool-call-container {
  @apply my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden;
}

/* 工具调用头部 */
.tool-call-header {
  @apply w-full flex items-center gap-2 px-3 py-2;
  @apply bg-gray-50 dark:bg-gray-800;
  @apply hover:bg-gray-100 dark:hover:bg-gray-700;
  @apply transition-colors cursor-pointer;
}

/* 工具调用内容 */
.tool-call-content {
  @apply px-3 py-2 text-sm;
  @apply border-t border-gray-200 dark:border-gray-700;
}

/* 代码块 */
.tool-call-code {
  @apply bg-gray-100 dark:bg-gray-900 p-2 rounded;
  @apply text-xs font-mono overflow-x-auto;
}
```

### 5.2 错误提示样式

```css
/* 错误容器 */
.error-container {
  @apply my-2 flex items-start gap-2 p-3;
  @apply bg-red-50 dark:bg-red-900/20;
  @apply border border-red-200 dark:border-red-800;
  @apply rounded-lg;
}

/* 错误文本 */
.error-text {
  @apply text-sm text-red-700 dark:text-red-400;
}

/* 错误码 */
.error-code {
  @apply text-xs text-red-500 mt-1;
}
```

---

## 6. 测试要点

### 6.1 组件测试

```typescript
// __tests__/ToolCallPart.test.tsx

describe('ToolCallPart', () => {
  it('renders tool call with name', () => {
    const callPart = {
      id: 'part-1',
      message_id: 'msg-1',
      type: 'tool_call' as const,
      content: JSON.stringify({
        call_id: 'call_1',
        name: 'search',
        args: { query: 'test' },
      }),
      created_at: new Date().toISOString(),
    };

    render(<ToolCallPart callPart={callPart} />);

    expect(screen.getByText('search')).toBeInTheDocument();
  });

  it('shows success indicator when result is successful', () => {
    const callPart = { /* ... */ };
    const resultPart = {
      id: 'part-2',
      message_id: 'msg-1',
      type: 'tool_result' as const,
      content: JSON.stringify({
        call_id: 'call_1',
        name: 'search',
        result: 'found',
        success: true,
      }),
      created_at: new Date().toISOString(),
    };

    render(<ToolCallPart callPart={callPart} resultPart={resultPart} />);

    // 验证成功图标显示
    expect(screen.getByTestId('success-icon')).toBeInTheDocument();
  });

  it('expands to show args and result on click', async () => {
    const callPart = { /* ... */ };
    const resultPart = { /* ... */ };

    render(<ToolCallPart callPart={callPart} resultPart={resultPart} />);

    // 点击展开
    await userEvent.click(screen.getByRole('button'));

    // 验证参数和结果显示
    expect(screen.getByText('参数:')).toBeInTheDocument();
    expect(screen.getByText('结果:')).toBeInTheDocument();
  });
});
```

### 6.2 Store 测试

```typescript
// __tests__/chat.store.test.ts

describe('sendAIMessage with tool calls', () => {
  it('collects tool_call events in pendingParts', async () => {
    // Mock chatWithAgentStream
    vi.mock('@/lib/agentApi', () => ({
      chatWithAgentStream: async function* () {
        yield { event: 'tool_call', data: { name: 'search', args: {}, call_id: 'c1' } };
        yield { event: 'tool_result', data: { name: 'search', result: 'ok', call_id: 'c1' } };
        yield { event: 'message', data: { content: 'Done' } };
        yield { event: 'done', data: { status: 'complete' } };
      },
    }));

    const { result } = renderHook(() => useChatStore());

    await act(async () => {
      await result.current.sendAIMessage('test');
    });

    // 验证消息包含 tool_call 和 tool_result parts
    const messages = result.current.messages;
    // ... 验证逻辑
  });
});
```
