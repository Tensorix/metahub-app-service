import { useCallback, useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from 'xterm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Eraser, RefreshCcw, RotateCcw, TerminalSquare, X } from 'lucide-react';
import {
  TERMINAL_BIN_REPLAY,
  TERMINAL_BIN_STDERR,
  TERMINAL_BIN_STDOUT,
  type TerminalServerMessage,
} from '@/lib/terminalApi';
import { useTerminal } from '@/hooks/useTerminal';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  sessionId: string;
  onClose?: () => void;
  className?: string;
}

export function TerminalPanel({ sessionId, onClose, className }: TerminalPanelProps) {
  const {
    isConnected,
    isConnecting,
    error,
    lastExitCode,
    connect,
    disconnect,
    sendInput,
    resize,
    setOnBinaryMessage,
    setOnControlMessage,
  } = useTerminal(sessionId);

  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const decoderRef = useRef(new TextDecoder());

  const syncTerminalSize = useCallback(() => {
    const term = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    fitAddon.fit();
    if (term.cols > 0 && term.rows > 0) {
      resize(term.cols, term.rows);
    }
  }, [resize]);

  const connectTerminal = useCallback(async (opts: { reset?: boolean } = {}) => {
    const term = xtermRef.current;
    if (!term) return;

    decoderRef.current = new TextDecoder();
    term.reset();
    term.focus();

    try {
      await connect(opts);
      requestAnimationFrame(syncTerminalSize);
    } catch (err: any) {
      term.writeln('');
      term.writeln(`[connection failed] ${err?.message || 'Unable to connect terminal'}`);
    }
  }, [connect, syncTerminalSize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || xtermRef.current) return;

    const term = new Terminal({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 5000,
      theme: {
        background: '#0e1116',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#f472b6',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#f9a8d4',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.open(host);
    fitAddon.fit();
    term.focus();

    const inputDisposable = term.onData((data) => {
      sendInput(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      syncTerminalSize();
    });
    resizeObserver.observe(host);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    resizeObserverRef.current = resizeObserver;

    void connectTerminal();

    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      resizeObserverRef.current = null;
    };
  }, [connectTerminal, disconnect, sendInput, syncTerminalSize]);

  useEffect(() => {
    setOnBinaryMessage((frame) => {
      const term = xtermRef.current;
      if (!term || frame.length === 0) return;

      const channel = frame[0];
      let payload = frame.subarray(1);

      if (channel === TERMINAL_BIN_REPLAY) {
        if (frame.length <= 9) return;
        payload = frame.subarray(9);
      } else if (channel !== TERMINAL_BIN_STDOUT && channel !== TERMINAL_BIN_STDERR) {
        return;
      }

      const text = decoderRef.current.decode(payload, { stream: true });
      if (text) {
        term.write(text);
      }
    });

    setOnControlMessage((message: TerminalServerMessage) => {
      const term = xtermRef.current;
      if (!term) return;

      switch (message.type) {
        case 'connected':
          term.focus();
          requestAnimationFrame(syncTerminalSize);
          break;
        case 'exit':
          term.writeln('');
          term.writeln(`[process exited with code ${message.exit_code ?? 0}]`);
          break;
        case 'error':
          term.writeln('');
          term.writeln(`[terminal error] ${message.error}`);
          break;
        case 'pong':
          break;
      }
    });

    return () => {
      setOnBinaryMessage(null);
      setOnControlMessage(null);
    };
  }, [setOnBinaryMessage, setOnControlMessage, syncTerminalSize]);

  const handleClear = useCallback(() => {
    xtermRef.current?.clear();
    xtermRef.current?.focus();
  }, []);

  const handleReconnect = useCallback(() => {
    void connectTerminal();
  }, [connectTerminal]);

  const handleReset = useCallback(() => {
    void connectTerminal({ reset: true });
  }, [connectTerminal]);

  const handleContainerClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  const statusText = error
    ? `Error: ${error}`
    : isConnecting
      ? 'Connecting...'
      : isConnected
        ? 'Connected'
        : lastExitCode !== null
          ? `Exited (${lastExitCode})`
          : 'Disconnected';

  return (
    <div
      className={cn('flex h-full flex-col bg-[#0e1116] text-zinc-200', className)}
      onClick={handleContainerClick}
    >
      <div className="flex items-center justify-between border-b border-zinc-800/60 bg-[#161b22] px-3 py-1 shrink-0">
        <div className="flex items-center gap-2 text-zinc-500">
          <TerminalSquare className="h-3.5 w-3.5" />
          <span className="text-xs font-mono">Terminal</span>
          <span className="text-[11px] text-zinc-600">{statusText}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            title="Clear viewport"
          >
            <Eraser className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={(e) => {
              e.stopPropagation();
              handleReconnect();
            }}
            title="Reconnect terminal"
          >
            <RefreshCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={(e) => {
              e.stopPropagation();
              handleReset();
            }}
            title="Reset shell"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close terminal"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={hostRef} className="h-full w-full px-1 py-1" />
      </div>
    </div>
  );
}
