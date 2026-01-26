# Step 5: 前端 API 客户端

## 1. 目标

- 实现 SSE 流式客户端
- 实现 WebSocket 客户端 (可选)
- 提供 TypeScript 类型定义

## 2. 文件结构

```
frontend/src/lib/
├── api.ts          # 现有 API 客户端 (不修改)
└── agentApi.ts     # Agent Chat API 客户端 (新增)
```

## 3. 类型定义

### 3.1 frontend/src/types/agent.ts

```typescript
/**
 * Agent Chat API types
 */

// SSE Event types
export type ChatEventType =
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'done'
  | 'error';

export interface ChatEventMessage {
  event: 'message';
  data: {
    content: string;
  };
}

export interface ChatEventToolCall {
  event: 'tool_call';
  data: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface ChatEventToolResult {
  event: 'tool_result';
  data: {
    name: string;
    result: string;
  };
}

export interface ChatEventDone {
  event: 'done';
  data: {
    status: 'complete' | 'cancelled';
  };
}

export interface ChatEventError {
  event: 'error';
  data: {
    error: string;
  };
}

export type ChatEvent =
  | ChatEventMessage
  | ChatEventToolCall
  | ChatEventToolResult
  | ChatEventDone
  | ChatEventError;

// Request/Response types
export interface ChatRequest {
  message: string;
  topic_id?: string;
  stream?: boolean;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  topic_id: string;
  message_id: string;
}

// WebSocket message types
export interface WSOutgoingMessage {
  type: 'message' | 'stop';
  content?: string;
  topic_id?: string;
}

export interface WSIncomingChunk {
  type: 'chunk';
  content: string;
}

export interface WSIncomingToolCall {
  type: 'tool_call';
  name: string;
  args: Record<string, unknown>;
}

export interface WSIncomingToolResult {
  type: 'tool_result';
  name: string;
  result: string;
}

export interface WSIncomingDone {
  type: 'done';
}

export interface WSIncomingError {
  type: 'error';
  message: string;
}

export interface WSIncomingStopped {
  type: 'stopped';
}

export type WSIncomingMessage =
  | WSIncomingChunk
  | WSIncomingToolCall
  | WSIncomingToolResult
  | WSIncomingDone
  | WSIncomingError
  | WSIncomingStopped;
```

## 4. API 客户端实现

### 4.1 frontend/src/lib/agentApi.ts

```typescript
/**
 * Agent Chat API client
 *
 * Provides:
 * - SSE streaming chat
 * - WebSocket chat (optional)
 * - Non-streaming chat
 */

import { getToken } from './auth';
import type {
  ChatEvent,
  ChatRequest,
  ChatResponse,
  WSOutgoingMessage,
  WSIncomingMessage,
} from '@/types/agent';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Chat with agent using SSE streaming
 *
 * @param sessionId - Session ID
 * @param message - User message
 * @param options - Optional parameters
 * @yields ChatEvent objects
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 *
 * for await (const event of chatWithAgentStream(sessionId, "Hello", {
 *   signal: controller.signal,
 * })) {
 *   if (event.event === 'message') {
 *     console.log(event.data.content);
 *   } else if (event.event === 'done') {
 *     console.log('Done!');
 *   }
 * }
 *
 * // To stop generation:
 * controller.abort();
 * ```
 */
export async function* chatWithAgentStream(
  sessionId: string,
  message: string,
  options?: {
    topicId?: string;
    signal?: AbortSignal;
  }
): AsyncGenerator<ChatEvent> {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${sessionId}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message,
        topic_id: options?.topicId,
        stream: true,
      } as ChatRequest),
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          // Empty line signals end of event
          try {
            const data = JSON.parse(currentData);
            yield { event: currentEvent, data } as ChatEvent;
          } catch {
            console.warn('Failed to parse SSE data:', currentData);
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Chat with agent (non-streaming)
 *
 * @param sessionId - Session ID
 * @param message - User message
 * @param topicId - Optional topic ID
 * @returns ChatResponse
 */
export async function chatWithAgent(
  sessionId: string,
  message: string,
  topicId?: string
): Promise<ChatResponse> {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${sessionId}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        topic_id: topicId,
        stream: false,
      } as ChatRequest),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Stop ongoing generation
 *
 * @param sessionId - Session ID
 * @param topicId - Topic ID
 */
export async function stopGeneration(
  sessionId: string,
  topicId: string
): Promise<{ success: boolean; message: string }> {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${sessionId}/chat/stop?topic_id=${topicId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }
  );

  return response.json();
}

/**
 * WebSocket chat client class
 *
 * @example
 * ```typescript
 * const client = new AgentWSClient(sessionId);
 *
 * client.onMessage = (event) => {
 *   if (event.type === 'chunk') {
 *     console.log(event.content);
 *   }
 * };
 *
 * await client.connect();
 * client.send("Hello");
 *
 * // To stop:
 * client.stop();
 *
 * // To disconnect:
 * client.disconnect();
 * ```
 */
export class AgentWSClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  public onMessage: ((event: WSIncomingMessage) => void) | null = null;
  public onOpen: (() => void) | null = null;
  public onClose: (() => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = API_BASE.replace(/^https?:/, '') || window.location.host;
      const url = `${protocol}//${host}/api/v1/sessions/${this.sessionId}/chat/ws?token=${token}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onOpen?.();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSIncomingMessage;
          this.onMessage?.(data);
        } catch {
          console.warn('Failed to parse WebSocket message:', event.data);
        }
      };

      this.ws.onclose = () => {
        this.onClose?.();
      };

      this.ws.onerror = (event) => {
        const error = new Error('WebSocket error');
        this.onError?.(error);
        reject(error);
      };
    });
  }

  /**
   * Send a message
   */
  send(content: string, topicId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message: WSOutgoingMessage = {
      type: 'message',
      content,
      topic_id: topicId,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Stop current generation
   */
  stop(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WSOutgoingMessage = { type: 'stop' };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Helper to collect full response from stream
 *
 * @param sessionId - Session ID
 * @param message - User message
 * @param options - Optional parameters
 * @returns Full response text
 */
export async function chatWithAgentFull(
  sessionId: string,
  message: string,
  options?: {
    topicId?: string;
    signal?: AbortSignal;
    onChunk?: (content: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
  }
): Promise<string> {
  const chunks: string[] = [];

  for await (const event of chatWithAgentStream(sessionId, message, {
    topicId: options?.topicId,
    signal: options?.signal,
  })) {
    if (event.event === 'message') {
      chunks.push(event.data.content);
      options?.onChunk?.(event.data.content);
    } else if (event.event === 'tool_call') {
      options?.onToolCall?.(event.data.name, event.data.args);
    } else if (event.event === 'error') {
      throw new Error(event.data.error);
    }
  }

  return chunks.join('');
}
```

## 5. 使用示例

### 5.1 基本流式调用

```typescript
import { chatWithAgentStream } from '@/lib/agentApi';

async function handleChat(sessionId: string, message: string) {
  const controller = new AbortController();

  try {
    for await (const event of chatWithAgentStream(sessionId, message, {
      signal: controller.signal,
    })) {
      switch (event.event) {
        case 'message':
          // Append content to UI
          appendToMessage(event.data.content);
          break;

        case 'tool_call':
          // Show tool being called
          showToolCall(event.data.name, event.data.args);
          break;

        case 'tool_result':
          // Show tool result
          showToolResult(event.data.name, event.data.result);
          break;

        case 'done':
          // Stream complete
          finishMessage();
          break;

        case 'error':
          // Handle error
          showError(event.data.error);
          break;
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      // User cancelled
      return;
    }
    throw error;
  }
}

// To stop generation
function handleStop() {
  controller.abort();
}
```

### 5.2 使用 Helper 函数

```typescript
import { chatWithAgentFull } from '@/lib/agentApi';

async function handleChat(sessionId: string, message: string) {
  const response = await chatWithAgentFull(sessionId, message, {
    onChunk: (content) => {
      // Real-time update
      updateUI(content);
    },
    onToolCall: (name, args) => {
      showToolIndicator(name);
    },
  });

  console.log('Full response:', response);
}
```

### 5.3 WebSocket 客户端

```typescript
import { AgentWSClient } from '@/lib/agentApi';

const client = new AgentWSClient(sessionId);

client.onMessage = (event) => {
  switch (event.type) {
    case 'chunk':
      appendToMessage(event.content);
      break;
    case 'tool_call':
      showToolCall(event.name, event.args);
      break;
    case 'done':
      finishMessage();
      break;
    case 'error':
      showError(event.message);
      break;
  }
};

client.onClose = () => {
  // Handle disconnect
};

await client.connect();
client.send("Hello");

// Later:
client.stop();      // Stop generation
client.disconnect(); // Close connection
```

## 6. 错误处理

```typescript
import { chatWithAgentStream } from '@/lib/agentApi';

async function handleChat(sessionId: string, message: string) {
  try {
    for await (const event of chatWithAgentStream(sessionId, message)) {
      if (event.event === 'error') {
        handleAPIError(event.data.error);
        return;
      }
      // Handle other events...
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      // User cancelled - not an error
      return;
    }

    if (error.message.includes('Not authenticated')) {
      // Redirect to login
      redirectToLogin();
      return;
    }

    if (error.message.includes('HTTP 404')) {
      showError('Session not found');
      return;
    }

    // Generic error
    showError('An error occurred. Please try again.');
    console.error('Chat error:', error);
  }
}
```

## 7. 测试

```typescript
// frontend/src/lib/__tests__/agentApi.test.ts
import { describe, it, expect, vi } from 'vitest';
import { chatWithAgentStream, chatWithAgent } from '../agentApi';

describe('agentApi', () => {
  it('should stream chat events', async () => {
    const events: ChatEvent[] = [];

    for await (const event of chatWithAgentStream('session-1', 'Hello')) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].event).toBe('done');
  });

  it('should handle non-streaming chat', async () => {
    const response = await chatWithAgent('session-1', 'Hello');

    expect(response.message).toBeDefined();
    expect(response.session_id).toBe('session-1');
  });

  it('should handle abort', async () => {
    const controller = new AbortController();

    const promise = (async () => {
      for await (const event of chatWithAgentStream('session-1', 'Hello', {
        signal: controller.signal,
      })) {
        // Should be aborted before any events
      }
    })();

    controller.abort();

    await expect(promise).rejects.toThrow('AbortError');
  });
});
```

## 8. 下一步

完成 API 客户端后，进入 [06-FRONTEND-STORE.md](./06-FRONTEND-STORE.md) 更新前端状态管理。
