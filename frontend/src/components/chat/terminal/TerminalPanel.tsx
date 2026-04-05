import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Eraser, X, TerminalSquare } from 'lucide-react';
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
  }, [terminal.lines, terminal.isBusy]);

  // Scroll to bottom and focus input when connected
  useEffect(() => {
    if (terminal.isConnected) {
      inputRef.current?.focus();
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [terminal.isConnected]);

  const handleSubmit = useCallback(() => {
    const cmd = inputValue;
    if (!cmd || terminal.isBusy) return;
    terminal.sendCommand(cmd);
    if (cmd.trim()) {
      setHistory((prev) => [...prev, cmd]);
    }
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
        } else {
          // Like a real terminal: ^C on empty line, show it and reset input
          if (inputValue) {
            setInputValue('');
          }
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
      } else if (e.key === 'u' && e.ctrlKey) {
        e.preventDefault();
        setInputValue('');
      }
    },
    [handleSubmit, terminal, history, historyIndex, inputValue]
  );

  // When a command is running the input is unmounted — move focus to the
  // scroll container so it can still capture keyboard events (Ctrl-C).
  useEffect(() => {
    if (terminal.isBusy) {
      scrollRef.current?.focus();
    }
  }, [terminal.isBusy]);

  // Handle Ctrl-C on the scroll container (when input is unmounted during busy)
  const handleContainerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'c' && e.ctrlKey && terminal.isBusy) {
        e.preventDefault();
        terminal.interrupt();
      }
    },
    [terminal]
  );

  // Focus input when clicking anywhere in the terminal
  const handleContainerClick = useCallback(() => {
    if (terminal.isBusy) {
      scrollRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [terminal.isBusy]);

  // Derive short prompt path (last 2 segments)
  const promptPath = terminal.cwd === '/' ? '/' : terminal.cwd.split('/').slice(-2).join('/');

  return (
    <div
      className={cn('flex flex-col h-full bg-[#0e1116] text-zinc-200 select-text', className)}
      onClick={handleContainerClick}
    >
      {/* Minimal header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800/60 bg-[#161b22] shrink-0">
        <div className="flex items-center gap-2 text-zinc-500">
          <TerminalSquare className="h-3.5 w-3.5" />
          <span className="text-xs font-mono">Terminal</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={(e) => { e.stopPropagation(); terminal.clear(); }}
            title="Clear (Ctrl+L)"
          >
            <Eraser className="h-3 w-3" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Close terminal"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable output + inline input */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-[1.6] outline-none"
        tabIndex={-1}
        onKeyDown={handleContainerKeyDown}
      >
        {/* Connection state */}
        {!terminal.isConnected && !terminal.error && (
          <div className="text-zinc-600">Connecting to sandbox...</div>
        )}
        {terminal.error && !terminal.isConnected && (
          <div className="text-red-400/80">Connection failed: {terminal.error}</div>
        )}

        {/* Output lines */}
        {terminal.lines.map((line) => (
          <TerminalLineView key={line.id} line={line} cwd={terminal.cwd} />
        ))}

        {/* Busy indicator while command is running */}
        {terminal.isBusy && (
          <span className="inline-block w-1.5 h-[14px] bg-zinc-500 animate-pulse ml-0.5 align-middle" />
        )}

        {/* Inline prompt + input (sits in the output flow) */}
        {terminal.isConnected && !terminal.isBusy && (
          <div className="flex items-center min-h-[22px] group">
            <span className="text-emerald-500 shrink-0 mr-1.5">
              {promptPath}
            </span>
            <span className="text-zinc-500 mr-1.5">$</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent border-none outline-none font-mono text-[13px] text-zinc-200 caret-zinc-400 p-0 m-0 leading-[1.6]"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalLineView({ line, cwd }: { line: TerminalLine; cwd: string }) {
  const promptPath = cwd === '/' ? '/' : cwd.split('/').slice(-2).join('/');

  switch (line.type) {
    case 'command':
      return (
        <div className="flex items-baseline flex-wrap">
          <span className="text-emerald-500 shrink-0 mr-1.5">{promptPath}</span>
          <span className="text-zinc-500 mr-1.5">$</span>
          <span className="text-zinc-100">{line.text}</span>
          {line.exitCode !== undefined && line.exitCode !== 0 && (
            <span className="text-red-400/70 text-[11px] ml-auto shrink-0">
              [{line.exitCode}]
            </span>
          )}
        </div>
      );
    case 'stdout':
      return <div className="text-zinc-300 whitespace-pre-wrap break-all">{line.text}</div>;
    case 'stderr':
      return <div className="text-red-400/80 whitespace-pre-wrap break-all">{line.text}</div>;
    case 'system':
      return <div className="text-zinc-600 text-[12px]">{line.text}</div>;
    default:
      return null;
  }
}
