/**
 * Agent Chat API client
 *
 * Provides:
 * - SSE streaming chat (with event id for reconnection)
 * - Stream status / reconnect endpoints
 * - WebSocket chat (optional)
 * - Non-streaming chat
 */

import { getApiBaseUrl } from '@/config/env';
import type {
  ChatEvent,
  ChatRequest,
  ChatResponse,
  StreamStatusResponse,
  WSOutgoingMessage,
  WSIncomingMessage,
} from '@/types/agent';

const API_BASE = getApiBaseUrl();

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

// ---------------------------------------------------------------------------
// Shared SSE parser — extracts event, data, and id fields
// ---------------------------------------------------------------------------

/**
 * Parse SSE-formatted text from a ReadableStream into ChatEvent objects.
 * Each yielded event includes an optional numeric `_eventId` field from the
 * server-assigned `id:` line, which callers can use for reconnection.
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<ChatEvent & { _eventId?: number }> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Normalize line endings to simplify mixed \r\n and \n streams
      buffer = buffer.replace(/\r\n/g, '\n');

      while (buffer.includes('\n\n')) {
        const separatorIndex = buffer.indexOf('\n\n');
        const eventText = buffer.substring(0, separatorIndex);
        buffer = buffer.substring(separatorIndex + 2);

        const lines = eventText.split('\n');
        let currentEvent = '';
        const dataLines: string[] = [];
        let currentId = '';

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();
          if (!line || line.startsWith(':')) continue; // comment/heartbeat
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
            continue;
          }
          if (line.startsWith('id:')) {
            currentId = line.slice(3).trim();
          }
        }

        const currentData = dataLines.join('\n');
        if (currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            const chatEvent = { event: currentEvent, data } as ChatEvent;
            const eventId = currentId ? parseInt(currentId, 10) : undefined;
            yield { ...chatEvent, _eventId: Number.isNaN(eventId) ? undefined : eventId };
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

// ---------------------------------------------------------------------------
// SSE streaming chat
// ---------------------------------------------------------------------------

/**
 * Chat with agent using SSE streaming.
 *
 * Each yielded event has an optional `_eventId` field (server-assigned,
 * incrementing integer). Track this value and pass it to `reconnectStream()`
 * if the connection drops.
 */
export async function* chatWithAgentStream(
  sessionId: string,
  message: string,
  options?: {
    topicId?: string;
    signal?: AbortSignal;
  }
): AsyncGenerator<ChatEvent & { _eventId?: number }> {
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

  yield* parseSSEStream(reader);
}

// ---------------------------------------------------------------------------
// Stream status & reconnect
// ---------------------------------------------------------------------------

/**
 * Get the status of an active or recently-completed stream session.
 */
export async function getStreamStatus(
  sessionId: string,
  topicId: string,
): Promise<StreamStatusResponse> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${sessionId}/topics/${topicId}/stream/status`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Reconnect to an active or recently-completed stream session.
 *
 * Replays buffered events with id > lastEventId, then continues with
 * live events. If the session has expired, yields a single
 * `stream_expired` event.
 */
export async function* reconnectStream(
  sessionId: string,
  topicId: string,
  lastEventId: number,
  options?: { signal?: AbortSignal },
): AsyncGenerator<ChatEvent & { _eventId?: number }> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${sessionId}/topics/${topicId}/stream/reconnect?last_event_id=${lastEventId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal: options?.signal,
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  yield* parseSSEStream(reader);
}

// ---------------------------------------------------------------------------
// Non-streaming chat
// ---------------------------------------------------------------------------

/**
 * Chat with agent (non-streaming)
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

// ---------------------------------------------------------------------------
// Resume (HITL)
// ---------------------------------------------------------------------------

/**
 * Resume chat after human-in-the-loop approval
 */
export async function* chatResumeStream(
  sessionId: string,
  topicId: string,
  decisions: Array<{ type: string; edited_action?: { name: string; args: Record<string, unknown> } }>,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ChatEvent & { _eventId?: number }> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(
    `${API_BASE}/api/v1/sessions/${sessionId}/chat/resume`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ topic_id: topicId, decisions }),
      signal: options?.signal,
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  yield* parseSSEStream(reader);
}

// ---------------------------------------------------------------------------
// Stop generation
// ---------------------------------------------------------------------------

/**
 * Stop ongoing generation
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

// ---------------------------------------------------------------------------
// WebSocket client
// ---------------------------------------------------------------------------

/**
 * WebSocket chat client class
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

  stop(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WSOutgoingMessage = { type: 'stop' };
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ---------------------------------------------------------------------------
// Convenience helper
// ---------------------------------------------------------------------------

/**
 * Helper to collect full response from stream
 */
export async function chatWithAgentFull(
  sessionId: string,
  message: string,
  options?: {
    topicId?: string;
    signal?: AbortSignal;
    onChunk?: (content: string) => void;
    onOperationStart?: (event: { op_id: string; op_type: 'tool' | 'subagent'; name: string; args?: Record<string, unknown>; description?: string }) => void;
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
    } else if (event.event === 'operation_start') {
      options?.onOperationStart?.(event.data);
    } else if (event.event === 'error') {
      throw new Error(event.data.error);
    }
  }

  return chunks.join('');
}
