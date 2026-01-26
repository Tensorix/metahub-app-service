# Step 6: 前端状态管理

## 1. 目标

- 扩展现有 chat store 支持 AI 对话
- 添加流式消息状态
- 添加停止生成功能

## 2. 状态设计

### 2.1 新增状态字段

```typescript
interface ChatState {
  // === 现有状态 ===
  sessions: Session[];
  topics: Topic[];
  messages: Message[];
  currentSessionId: string | null;
  currentTopicId: string | null;
  // ...

  // === AI 对话新增状态 ===

  // 流式状态
  isStreaming: boolean;              // 是否正在生成
  streamingMessageId: string | null; // 正在生成的消息 ID
  streamingContent: string;          // 累积的流式内容
  abortController: AbortController | null; // 用于取消生成

  // 工具调用状态
  activeToolCall: {
    name: string;
    args: Record<string, unknown>;
  } | null;

  // 错误状态
  streamError: string | null;
}
```

### 2.2 新增 Actions

```typescript
interface ChatActions {
  // === 现有 Actions ===
  // ...

  // === AI 对话新增 Actions ===

  // 发送 AI 消息
  sendAIMessage: (content: string) => Promise<void>;

  // 停止生成
  stopGeneration: () => void;

  // 重新生成
  regenerateMessage: (messageId: string) => Promise<void>;

  // 清除流式状态
  clearStreamState: () => void;
}
```

## 3. 实现详情

### 3.1 修改 frontend/src/store/chat.ts

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { chatWithAgentStream, stopGeneration as apiStopGeneration } from '@/lib/agentApi';
import type { ChatEvent } from '@/types/agent';

// ... 现有类型定义 ...

interface ChatState {
  // === 现有状态 ===
  sessions: Session[];
  topics: Topic[];
  messages: Message[];
  currentSessionId: string | null;
  currentTopicId: string | null;
  isLoading: boolean;
  error: string | null;

  // === AI 对话状态 ===
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  abortController: AbortController | null;
  activeToolCall: {
    name: string;
    args: Record<string, unknown>;
  } | null;
  streamError: string | null;
}

interface ChatActions {
  // === 现有 Actions ===
  fetchSessions: () => Promise<void>;
  fetchTopics: (sessionId: string) => Promise<void>;
  fetchMessages: (topicId: string) => Promise<void>;
  createSession: (data: CreateSessionData) => Promise<Session>;
  createTopic: (sessionId: string, name: string) => Promise<Topic>;
  sendMessage: (topicId: string, content: string) => Promise<Message>;
  setCurrentSession: (sessionId: string | null) => void;
  setCurrentTopic: (topicId: string | null) => void;

  // === AI 对话 Actions ===
  sendAIMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  clearStreamState: () => void;
}

type ChatStore = ChatState & ChatActions;

export const useChatStore = create<ChatStore>()(
  immer((set, get) => ({
    // === 初始状态 ===
    sessions: [],
    topics: [],
    messages: [],
    currentSessionId: null,
    currentTopicId: null,
    isLoading: false,
    error: null,

    // AI 对话初始状态
    isStreaming: false,
    streamingMessageId: null,
    streamingContent: '',
    abortController: null,
    activeToolCall: null,
    streamError: null,

    // === 现有 Actions 实现 ===
    // ... (保持不变) ...

    // === AI 对话 Actions 实现 ===

    /**
     * 发送 AI 消息并处理流式响应
     */
    sendAIMessage: async (content: string) => {
      const { currentSessionId, currentTopicId, sessions } = get();

      if (!currentSessionId) {
        set({ streamError: 'No session selected' });
        return;
      }

      // 检查是否是 AI session
      const session = sessions.find(s => s.id === currentSessionId);
      if (!session || session.type !== 'ai') {
        set({ streamError: 'Not an AI session' });
        return;
      }

      // 创建 AbortController
      const controller = new AbortController();

      // 生成临时消息 ID
      const userMessageId = `temp-user-${Date.now()}`;
      const aiMessageId = `temp-ai-${Date.now()}`;

      // 添加用户消息到 UI
      set((state) => {
        state.messages.push({
          id: userMessageId,
          topic_id: currentTopicId || '',
          role: 'user',
          parts: [{ type: 'text', content }],
          created_at: new Date().toISOString(),
        });

        // 添加空的 AI 消息占位
        state.messages.push({
          id: aiMessageId,
          topic_id: currentTopicId || '',
          role: 'assistant',
          parts: [{ type: 'text', content: '' }],
          created_at: new Date().toISOString(),
        });

        state.isStreaming = true;
        state.streamingMessageId = aiMessageId;
        state.streamingContent = '';
        state.abortController = controller;
        state.streamError = null;
        state.activeToolCall = null;
      });

      try {
        let newTopicId = currentTopicId;

        for await (const event of chatWithAgentStream(
          currentSessionId,
          content,
          {
            topicId: currentTopicId || undefined,
            signal: controller.signal,
          }
        )) {
          // 处理不同事件类型
          switch (event.event) {
            case 'message':
              set((state) => {
                state.streamingContent += event.data.content;

                // 更新消息内容
                const msgIndex = state.messages.findIndex(
                  m => m.id === state.streamingMessageId
                );
                if (msgIndex !== -1) {
                  state.messages[msgIndex].parts[0].content =
                    state.streamingContent;
                }
              });
              break;

            case 'tool_call':
              set((state) => {
                state.activeToolCall = {
                  name: event.data.name,
                  args: event.data.args,
                };
              });
              break;

            case 'tool_result':
              set((state) => {
                state.activeToolCall = null;
                // 可选：将工具结果添加到消息 metadata
              });
              break;

            case 'done':
              // 流式完成
              set((state) => {
                state.isStreaming = false;
                state.streamingMessageId = null;
                state.abortController = null;
                state.activeToolCall = null;
              });

              // 刷新消息列表获取真实 ID
              if (newTopicId || currentTopicId) {
                get().fetchMessages(newTopicId || currentTopicId!);
              }
              break;

            case 'error':
              set((state) => {
                state.isStreaming = false;
                state.streamError = event.data.error;
                state.abortController = null;
                state.activeToolCall = null;
              });
              break;
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // 用户取消，不是错误
          set((state) => {
            state.isStreaming = false;
            state.abortController = null;
            state.activeToolCall = null;
            // 标记消息为已取消
            const msgIndex = state.messages.findIndex(
              m => m.id === state.streamingMessageId
            );
            if (msgIndex !== -1) {
              state.messages[msgIndex].parts[0].content += ' [已取消]';
            }
            state.streamingMessageId = null;
          });
        } else {
          set((state) => {
            state.isStreaming = false;
            state.streamError = (error as Error).message;
            state.abortController = null;
            state.activeToolCall = null;
            state.streamingMessageId = null;
          });
        }
      }
    },

    /**
     * 停止当前生成
     */
    stopGeneration: () => {
      const { abortController, currentSessionId, currentTopicId } = get();

      if (abortController) {
        abortController.abort();
      }

      // 也调用后端 API 确保停止
      if (currentSessionId && currentTopicId) {
        apiStopGeneration(currentSessionId, currentTopicId).catch(() => {
          // Ignore errors
        });
      }

      set((state) => {
        state.isStreaming = false;
        state.abortController = null;
        state.activeToolCall = null;
      });
    },

    /**
     * 重新生成指定消息
     */
    regenerateMessage: async (messageId: string) => {
      const { messages, currentSessionId, currentTopicId } = get();

      // 找到消息
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return;

      const message = messages[messageIndex];
      if (message.role !== 'assistant') return;

      // 找到对应的用户消息
      const userMessage = messages
        .slice(0, messageIndex)
        .reverse()
        .find(m => m.role === 'user');

      if (!userMessage) return;

      // 删除 AI 消息
      set((state) => {
        state.messages = state.messages.filter(m => m.id !== messageId);
      });

      // 获取用户消息内容
      const userContent = userMessage.parts
        .filter(p => p.type === 'text')
        .map(p => p.content)
        .join('');

      // 重新发送
      await get().sendAIMessage(userContent);
    },

    /**
     * 清除流式状态
     */
    clearStreamState: () => {
      set((state) => {
        state.isStreaming = false;
        state.streamingMessageId = null;
        state.streamingContent = '';
        state.abortController = null;
        state.activeToolCall = null;
        state.streamError = null;
      });
    },
  }))
);
```

## 4. Hook 封装

### 4.1 frontend/src/hooks/useAIChat.ts

```typescript
import { useCallback } from 'react';
import { useChatStore } from '@/store/chat';

/**
 * Hook for AI chat functionality
 */
export function useAIChat() {
  const {
    isStreaming,
    streamingContent,
    activeToolCall,
    streamError,
    sendAIMessage,
    stopGeneration,
    regenerateMessage,
    clearStreamState,
  } = useChatStore();

  const send = useCallback(
    async (content: string) => {
      if (isStreaming) {
        console.warn('Already streaming');
        return;
      }
      await sendAIMessage(content);
    },
    [isStreaming, sendAIMessage]
  );

  const stop = useCallback(() => {
    stopGeneration();
  }, [stopGeneration]);

  const regenerate = useCallback(
    async (messageId: string) => {
      if (isStreaming) {
        console.warn('Already streaming');
        return;
      }
      await regenerateMessage(messageId);
    },
    [isStreaming, regenerateMessage]
  );

  return {
    // State
    isStreaming,
    streamingContent,
    activeToolCall,
    error: streamError,

    // Actions
    send,
    stop,
    regenerate,
    clearError: clearStreamState,
  };
}
```

## 5. 使用示例

### 5.1 在组件中使用

```tsx
import { useAIChat } from '@/hooks/useAIChat';
import { useChatStore } from '@/store/chat';

function ChatInput() {
  const [input, setInput] = useState('');
  const { isStreaming, send, stop, error } = useAIChat();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    await send(input);
    setInput('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isStreaming}
        placeholder="Type a message..."
      />

      {isStreaming ? (
        <button type="button" onClick={stop}>
          Stop
        </button>
      ) : (
        <button type="submit" disabled={!input.trim()}>
          Send
        </button>
      )}

      {error && <div className="error">{error}</div>}
    </form>
  );
}
```

### 5.2 显示流式消息

```tsx
function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const { isStreaming, streamingContent, activeToolCall } = useAIChat();

  return (
    <div className="messages">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}

      {/* 工具调用指示器 */}
      {activeToolCall && (
        <div className="tool-indicator">
          Calling {activeToolCall.name}...
        </div>
      )}
    </div>
  );
}
```

## 6. 状态流转图

```
初始状态
  │
  ▼ sendAIMessage()
┌─────────────────┐
│  isStreaming    │
│  = true         │───────────────────┐
│                 │                   │
│  创建用户消息   │                   │
│  创建 AI 占位   │                   │
└────────┬────────┘                   │
         │                            │
         ▼ event: message             │ abort / error
┌─────────────────┐                   │
│  累积内容       │                   │
│  更新 UI        │◄──┐               │
└────────┬────────┘   │               │
         │            │               │
         │ 继续流式   │               │
         └────────────┘               │
         │                            │
         ▼ event: done / error        │
┌─────────────────┐                   │
│  isStreaming    │◄──────────────────┘
│  = false        │
│                 │
│  清理状态       │
│  刷新消息       │
└─────────────────┘
```

## 7. 注意事项

### 7.1 内存管理

- `AbortController` 需要正确清理
- 流式内容累积可能很大，需要及时清理

### 7.2 并发控制

- 防止同时发送多个消息
- 使用 `isStreaming` 作为锁

### 7.3 错误恢复

- 网络错误后应允许重试
- 清理中间状态

## 8. 测试

```typescript
// frontend/src/store/__tests__/chat.test.ts
import { act, renderHook } from '@testing-library/react';
import { useChatStore } from '../chat';

describe('AI Chat', () => {
  beforeEach(() => {
    useChatStore.setState({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
    });
  });

  it('should handle streaming state', async () => {
    const { result } = renderHook(() => useChatStore());

    // Start streaming
    act(() => {
      result.current.sendAIMessage('Hello');
    });

    expect(result.current.isStreaming).toBe(true);
  });

  it('should stop generation', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.stopGeneration();
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
```

## 9. 下一步

完成状态管理后，进入 [07-FRONTEND-COMPONENTS.md](./07-FRONTEND-COMPONENTS.md) 创建 UI 组件。
