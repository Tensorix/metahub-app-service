/**
 * SandboxPanel - unified panel for managing a session's sandbox.
 * Three tabs: Config (image/timeout + start/stop), Terminal, Browser.
 */

import { useState } from 'react';
import { useChatStore } from '@/store/chat';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Container, X } from 'lucide-react';
import { SandboxConfigTab } from './SandboxConfigTab';
import { SandboxBrowserTab } from './SandboxBrowserTab';
import { TerminalPanel } from '../terminal/TerminalPanel';

interface SandboxPanelProps {
  sessionId: string;
  className?: string;
  onClose?: () => void;
}

type TabKey = 'config' | 'terminal' | 'browser';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'config', label: 'Config' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'browser', label: 'Browser' },
];

export function SandboxPanel({ sessionId, className, onClose }: SandboxPanelProps) {
  const sandboxStatus = useChatStore((s) => s.sandboxStatus);
  const current = sandboxStatus[sessionId] ?? null;
  const isRunning = current?.status === 'running';

  const [activeTab, setActiveTab] = useState<TabKey>('config');

  const statusText = current?.status
    ? current.status.charAt(0).toUpperCase() + current.status.slice(1)
    : 'Not started';

  return (
    <div className={cn('flex flex-col h-full border-l bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Container className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium text-sm">Sandbox</span>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-md',
              isRunning
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : current?.status === 'error'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {statusText}
          </span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — mount all tabs to preserve state, toggle via hidden */}
      <div className="flex-1 min-h-0 relative">
        <div className={cn('absolute inset-0', activeTab !== 'config' && 'hidden')}>
          <SandboxConfigTab sessionId={sessionId} />
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'terminal' && 'hidden')}>
          {isRunning ? (
            <TerminalPanel sessionId={sessionId} className="h-full" />
          ) : (
            <EmptyState message="Start the sandbox to use the terminal." />
          )}
        </div>
        <div className={cn('absolute inset-0', activeTab !== 'browser' && 'hidden')}>
          <SandboxBrowserTab sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
