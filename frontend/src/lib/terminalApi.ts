/**
 * Terminal WebSocket client for OpenSandbox PTY proxy sessions.
 */

import { getApiBaseUrl } from '@/config/env';

const API_BASE = getApiBaseUrl();
const BIN_STDIN = 0x00;

export const TERMINAL_BIN_STDOUT = 0x01;
export const TERMINAL_BIN_STDERR = 0x02;
export const TERMINAL_BIN_REPLAY = 0x03;

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

function joinUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = API_BASE.replace(/^https?:/, '') || window.location.host;
  return `${protocol}//${host}${path}`;
}

export type TerminalServerMessage =
  | { type: 'connected'; session_id?: string; mode?: string }
  | { type: 'exit'; exit_code?: number }
  | { type: 'error'; error: string; code?: string }
  | { type: 'pong' };

export type TerminalClientMessage =
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'signal'; signal: string }
  | { type: 'ping' };

export class TerminalWSClient {
  private ws: WebSocket | null = null;
  private readonly sessionId: string;
  private readonly encoder = new TextEncoder();

  public onControlMessage: ((msg: TerminalServerMessage) => void) | null = null;
  public onBinaryMessage: ((data: Uint8Array) => void) | null = null;
  public onOpen: (() => void) | null = null;
  public onClose: (() => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect(opts: { reset?: boolean } = {}): Promise<void> {
    const token = getToken();
    if (!token) {
      return Promise.reject(new Error('Not authenticated'));
    }

    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ token });
      if (opts.reset) {
        params.set('reset', '1');
      }

      const url = joinUrl(
        `/api/v1/sessions/${this.sessionId}/sandbox/terminal?${params.toString()}`
      );

      let settled = false;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        settled = true;
        this.onOpen?.();
        resolve();
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data) as TerminalServerMessage;
            this.onControlMessage?.(data);
          } catch {
            console.warn('Failed to parse terminal WS control message:', event.data);
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          this.onBinaryMessage?.(new Uint8Array(event.data));
          return;
        }

        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buffer) => {
            this.onBinaryMessage?.(new Uint8Array(buffer));
          });
        }
      };

      ws.onclose = () => {
        this.onClose?.();
        this.ws = null;
        if (!settled) {
          reject(new Error('Terminal WebSocket closed before opening'));
        }
      };

      ws.onerror = () => {
        const error = new Error('Terminal WebSocket error');
        this.onError?.(error);
        if (!settled) {
          reject(error);
        }
      };
    });
  }

  sendInput(data: string | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const raw = typeof data === 'string' ? this.encoder.encode(data) : data;
    const payload = new Uint8Array(raw.length + 1);
    payload[0] = BIN_STDIN;
    payload.set(raw, 1);
    this.ws.send(payload);
  }

  sendControl(message: TerminalClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  resize(cols: number, rows: number): void {
    this.sendControl({ type: 'resize', cols, rows });
  }

  signal(signal: string): void {
    this.sendControl({ type: 'signal', signal });
  }

  ping(): void {
    this.sendControl({ type: 'ping' });
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
