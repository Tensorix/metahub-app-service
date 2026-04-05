import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Eraser, Square, X } from 'lucide-react';
import { useTerminal, type TerminalLine } from '@/hooks/useTerminal';

interface TerminalPanelProps {
  sessionId: string;
  onClose?: () => void;
  className?: string;
}

export function TerminalPanel({ sessionId, onClose, className }: TerminalPanelProps) {
  const terminal = useTerminal(sessionId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Command history for up/down navigation
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Auto-connect on mount
  useEffect(() => {
    terminal.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [terminal.lines]);

  // Focus input when connected
  useEffect(() => {
    if (terminal.isConnected) {
      inputRef.current?.focus();
    }
  }, [terminal.isConnected]);

  const handleSubmit = useCallback(() => {
    const cmd = inputValue.trim();
    if (!cmd || terminal.isBusy) return;
    terminal.sendCommand(cmd);
    setHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setInputValue('');
  }, [inputValue, terminal]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        if (terminal.isBusy) {
          terminal.interrupt();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length === 0) return;
        const newIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIdx);
        setInputValue(history[newIdx]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === -1) return;
        const newIdx = historyIndex + 1;
        if (newIdx >= history.length) {
          setHistoryIndex(-1);
          setInputValue('');
        } else {
          setHistoryIndex(newIdx);
          setInputValue(history[newIdx]);
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        terminal.clear();
      }
    },
    [handleSubmit, terminal, history, historyIndex]
  );

  return (
    <div
      className={cn('flex flex-col h-full bg-zinc-950 text-zinc-100', className)}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="text-xs font-mono text-zinc-400 truncate">
          {terminal.cwd}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation();
              terminal.clear();
            }}
            title="Clear (Ctrl+L)"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Output area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-sm leading-relaxed">
        {terminal.error && !terminal.isConnected && (
          <div className="text-red-400 mb-2">Connection error: {terminal.error}</div>
        )}
        {terminal.lines.map((line) => (
          <TerminalLineView key={line.id} line={line} />
        ))}
        {terminal.isBusy && (
          <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse" />
        )}
      </div>

      {/* Input line */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 bg-zinc-900 shrink-0">
        <span className="text-xs font-mono text-green-400 whitespace-nowrap shrink-0">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!terminal.isConnected || terminal.isBusy}
          placeholder={
            !terminal.isConnected
              ? 'Connecting...'
              : terminal.isBusy
                ? 'Running...'
                : 'Type a command...'
          }
          className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
        />
        {terminal.isBusy && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-zinc-800 shrink-0"
            onClick={() => terminal.interrupt()}
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

function TerminalLineView({ line }: { line: TerminalLine }) {
  switch (line.type) {
    case 'command':
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-green-400">$</span>
          <span className="font-bold text-zinc-100">{line.text}</span>
          {line.exitCode !== undefined && line.exitCode !== 0 && (
            <span className="text-xs text-red-400 ml-auto shrink-0">
              exit {line.exitCode}
            </span>
          )}
        </div>
      );
    case 'stdout':
      return <div className="text-zinc-300 whitespace-pre-wrap break-all">{line.text}</div>;
    case 'stderr':
      return <div className="text-red-400 whitespace-pre-wrap break-all">{line.text}</div>;
    case 'system':
      return <div className="text-zinc-500 italic">{line.text}</div>;
    default:
      return null;
  }
}
