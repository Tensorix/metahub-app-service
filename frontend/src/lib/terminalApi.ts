/**
 * Terminal WebSocket client for interactive sandbox shell sessions.
 */

import { getApiBaseUrl } from '@/config/env';

const API_BASE = getApiBaseUrl();

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

// --- Message types ---

export type TerminalServerMessage =
  | { type: 'ready'; cwd: string }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'exit'; code: number }
  | { type: 'cwd'; path: string }
  | { type: 'error'; message: string };

export type TerminalClientMessage =
  | { type: 'command'; command: string }
  | { type: 'interrupt' };

// --- WebSocket client ---

export class TerminalWSClient {
  private ws: WebSocket | null = null;
  private sessionId: string;

  public onMessage: ((msg: TerminalServerMessage) => void) | null = null;
  public onOpen: (() => void) | null = null;
  public onClose: (() => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect(): Promise<void> {
    const token = getToken();
    if (!token) {
      return Promise.reject(new Error('Not authenticated'));
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = API_BASE.replace(/^https?:/, '') || window.location.host;
      const url = `${protocol}//${host}/api/v1/sessions/${this.sessionId}/sandbox/terminal?token=${token}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.onOpen?.();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TerminalServerMessage;
          this.onMessage?.(data);
        } catch {
          console.warn('Failed to parse terminal WS message:', event.data);
        }
      };

      this.ws.onclose = () => {
        this.onClose?.();
      };

      this.ws.onerror = () => {
        const error = new Error('Terminal WebSocket error');
        this.onError?.(error);
        reject(error);
      };
    });
  }

  sendCommand(command: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: TerminalClientMessage = { type: 'command', command };
    this.ws.send(JSON.stringify(msg));
  }

  interrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: TerminalClientMessage = { type: 'interrupt' };
    this.ws.send(JSON.stringify(msg));
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
