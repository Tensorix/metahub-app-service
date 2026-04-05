import { useState, useRef, useCallback, useEffect } from 'react';
import { TerminalWSClient } from '@/lib/terminalApi';

export interface TerminalLine {
  id: string;
  type: 'command' | 'stdout' | 'stderr' | 'system';
  text: string;
  exitCode?: number;
}

export interface UseTerminalReturn {
  lines: TerminalLine[];
  cwd: string;
  isConnected: boolean;
  isBusy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendCommand: (command: string) => void;
  interrupt: () => void;
  clear: () => void;
}

let lineCounter = 0;
function nextId(): string {
  return `tl-${++lineCounter}-${Date.now()}`;
}

export function useTerminal(sessionId: string): UseTerminalReturn {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [cwd, setCwd] = useState('/workspace');
  const [isConnected, setIsConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<TerminalWSClient | null>(null);
  // Track the id of the last command line so we can attach exitCode to it
  const lastCommandIdRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    // Disconnect existing if any
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    const client = new TerminalWSClient(sessionId);
    clientRef.current = client;
    setError(null);

    client.onMessage = (msg) => {
      switch (msg.type) {
        case 'ready':
          setIsConnected(true);
          setCwd(msg.cwd);
          setLines((prev) => [
            ...prev,
            { id: nextId(), type: 'system', text: `Connected to sandbox` },
          ]);
          break;

        case 'stdout':
          setLines((prev) => [
            ...prev,
            { id: nextId(), type: 'stdout', text: msg.text },
          ]);
          break;

        case 'stderr':
          setLines((prev) => [
            ...prev,
            { id: nextId(), type: 'stderr', text: msg.text },
          ]);
          break;

        case 'exit':
          setIsBusy(false);
          // Attach exit code to the last command line
          if (lastCommandIdRef.current) {
            const cmdId = lastCommandIdRef.current;
            setLines((prev) =>
              prev.map((l) =>
                l.id === cmdId ? { ...l, exitCode: msg.code } : l
              )
            );
          }
          break;

        case 'cwd':
          setCwd(msg.path);
          break;

        case 'error':
          setIsBusy(false);
          setLines((prev) => [
            ...prev,
            { id: nextId(), type: 'stderr', text: msg.message },
          ]);
          break;
      }
    };

    client.onClose = () => {
      setIsConnected(false);
      setIsBusy(false);
    };

    client.onError = (err) => {
      setError(err.message);
      setIsConnected(false);
      setIsBusy(false);
    };

    try {
      await client.connect();
    } catch (err: any) {
      setError(err?.message || 'Failed to connect');
    }
  }, [sessionId]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setIsConnected(false);
    setIsBusy(false);
  }, []);

  const sendCommand = useCallback((command: string) => {
    if (!clientRef.current?.isConnected) return;
    const id = nextId();
    lastCommandIdRef.current = id;
    setLines((prev) => [...prev, { id, type: 'command', text: command }]);
    setIsBusy(true);
    clientRef.current.sendCommand(command);
  }, []);

  const interrupt = useCallback(() => {
    clientRef.current?.interrupt();
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    lines,
    cwd,
    isConnected,
    isBusy,
    error,
    connect,
    disconnect,
    sendCommand,
    interrupt,
    clear,
  };
}
