/**
 * Agent Chat API client
 *
 * Provides:
 * - SSE streaming chat
 * - WebSocket chat (optional)
 * - Non-streaming chat
 */

import { getApiBaseUrl } from '@/config/env';
import type {
  ChatEvent,
  ChatRequest,
  ChatResponse,
  WSOutgoingMessage,
  WSIncomingMessage,
} from '@/types/agent';

const API_BASE = getApiBaseUrl();

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

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

  const url = `${API_BASE}/api/v1/sessions/${sessionId}/chat`;
  console.log('Fetching AI chat:', url, { message, topic_id: options?.topicId });

  const response = await fetch(url, {
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
  });

  console.log('Response status:', response.status, response.statusText);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('AI chat error:', error);
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

      // Parse SSE events - handle both \r\n\r\n and \n\n separators
      const separator = buffer.includes('\r\n') ? '\r\n\r\n' : '\n\n';
      const lineSeparator = buffer.includes('\r\n') ? '\r\n' : '\n';
      
      while (buffer.includes(separator)) {
        const separatorIndex = buffer.indexOf(separator);
        const event_text = buffer.substring(0, separatorIndex);
        buffer = buffer.substring(separatorIndex + separator.length);

        const lines = event_text.split(lineSeparator);
        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim();
          }
        }

        if (currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            yield { event: currentEvent, data } as ChatEvent;
          } catch {
            console.warn('Failed to parse SSE data:', currentData);
          }
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

      this.ws.onerror = () => {
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
