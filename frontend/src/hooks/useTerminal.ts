import { useCallback, useEffect, useRef, useState } from 'react';
import { TerminalWSClient, type TerminalServerMessage } from '@/lib/terminalApi';

export interface UseTerminalReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastExitCode: number | null;
  connect: (opts?: { reset?: boolean }) => Promise<void>;
  disconnect: () => void;
  sendInput: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
  signal: (signal: string) => void;
  setOnBinaryMessage: (handler: ((data: Uint8Array) => void) | null) => void;
  setOnControlMessage: (
    handler: ((message: TerminalServerMessage) => void) | null
  ) => void;
}

export function useTerminal(sessionId: string): UseTerminalReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExitCode, setLastExitCode] = useState<number | null>(null);

  const clientRef = useRef<TerminalWSClient | null>(null);
  const binaryHandlerRef = useRef<((data: Uint8Array) => void) | null>(null);
  const controlHandlerRef = useRef<((message: TerminalServerMessage) => void) | null>(null);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(async (opts: { reset?: boolean } = {}) => {
    disconnect();

    const client = new TerminalWSClient(sessionId);
    clientRef.current = client;
    setError(null);
    setLastExitCode(null);
    setIsConnecting(true);

    client.onBinaryMessage = (data) => {
      if (clientRef.current !== client) return;
      binaryHandlerRef.current?.(data);
    };

    client.onControlMessage = (message) => {
      if (clientRef.current !== client) return;
      if (message.type === 'exit') {
        setLastExitCode(message.exit_code ?? null);
      } else if (message.type === 'error') {
        setError(message.error);
      }
      controlHandlerRef.current?.(message);
    };

    client.onOpen = () => {
      if (clientRef.current !== client) return;
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    };

    client.onClose = () => {
      if (clientRef.current !== client) return;
      setIsConnected(false);
      setIsConnecting(false);
    };

    client.onError = (err) => {
      if (clientRef.current !== client) return;
      setError(err.message);
      setIsConnected(false);
      setIsConnecting(false);
    };

    try {
      await client.connect(opts);
    } catch (err: any) {
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      setError(err?.message || 'Failed to connect');
      setIsConnected(false);
      setIsConnecting(false);
      throw err;
    }
  }, [disconnect, sessionId]);

  const sendInput = useCallback((data: string | Uint8Array) => {
    clientRef.current?.sendInput(data);
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    clientRef.current?.resize(cols, rows);
  }, []);

  const signal = useCallback((signalName: string) => {
    clientRef.current?.signal(signalName);
  }, []);

  const setOnBinaryMessage = useCallback((handler: ((data: Uint8Array) => void) | null) => {
    binaryHandlerRef.current = handler;
  }, []);

  const setOnControlMessage = useCallback((
    handler: ((message: TerminalServerMessage) => void) | null
  ) => {
    controlHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    error,
    lastExitCode,
    connect,
    disconnect,
    sendInput,
    resize,
    signal,
    setOnBinaryMessage,
    setOnControlMessage,
  };
}
