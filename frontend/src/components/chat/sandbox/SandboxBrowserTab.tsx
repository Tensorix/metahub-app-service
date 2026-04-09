/**
 * SandboxBrowserTab - mini in-panel browser backed by an iframe.
 * Useful for previewing services running inside the sandbox or any
 * externally reachable URL. Proxying through the backend is out of
 * scope for this iteration; buildProxyUrl is reserved for future use.
 */

import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Play,
} from 'lucide-react';

interface SandboxBrowserTabProps {
  sessionId: string;
}

/**
 * Placeholder for a future backend-mediated proxy route. For now the
 * iframe hits the URL directly.
 */
function buildProxyUrl(_sessionId: string, url: string): string {
  return url;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function SandboxBrowserTab({ sessionId }: SandboxBrowserTabProps) {
  const sandboxStatus = useChatStore((s) => s.sandboxStatus);
  const createSandbox = useChatStore((s) => s.createSandbox);
  const current = sandboxStatus[sessionId] ?? null;
  const isRunning = current?.status === 'running';

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  const navigateTo = useCallback(
    (raw: string, pushHistory = true) => {
      const normalized = normalizeUrl(raw);
      if (!normalized) return;
      const proxied = buildProxyUrl(sessionId, normalized);
      setCurrentUrl(proxied);
      setUrlDraft(normalized);
      if (pushHistory) {
        setHistory((prev) => {
          const trimmed = prev.slice(0, historyIndex + 1);
          const next = [...trimmed, proxied];
          setHistoryIndex(next.length - 1);
          return next;
        });
      }
    },
    [sessionId, historyIndex],
  );

  const handleGo = useCallback(() => {
    if (urlDraft.trim()) navigateTo(urlDraft);
  }, [navigateTo, urlDraft]);

  const handleBack = useCallback(() => {
    if (!canGoBack) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setCurrentUrl(history[nextIndex]);
    setUrlDraft(history[nextIndex]);
    setIframeKey((k) => k + 1);
  }, [canGoBack, history, historyIndex]);

  const handleForward = useCallback(() => {
    if (!canGoForward) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setCurrentUrl(history[nextIndex]);
    setUrlDraft(history[nextIndex]);
    setIframeKey((k) => k + 1);
  }, [canGoForward, history, historyIndex]);

  const handleRefresh = useCallback(() => {
    if (!currentUrl) return;
    setIframeKey((k) => k + 1);
  }, [currentUrl]);

  const handleOpenExternal = useCallback(() => {
    if (!currentUrl) return;
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  }, [currentUrl]);

  const handleStartSandbox = async () => {
    try {
      await createSandbox(sessionId);
    } catch {
      // toast handled by store consumers if needed
    }
  };

  if (!isRunning) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Start the sandbox to use the browser.
        </p>
        <Button size="sm" onClick={handleStartSandbox}>
          <Play className="h-4 w-4 mr-1.5" />
          Start Sandbox
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Address bar */}
      <div className="flex items-center gap-1 p-2 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleBack}
          disabled={!canGoBack}
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleForward}
          disabled={!canGoForward}
          title="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          disabled={!currentUrl}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Input
          type="text"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGo();
          }}
          placeholder="https://example.com or http://localhost:8000"
          className="h-7 text-xs flex-1"
        />
        <Button size="sm" className="h-7" onClick={handleGo}>
          Go
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleOpenExternal}
          disabled={!currentUrl}
          title="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      {/* Iframe viewport */}
      <div className="flex-1 min-h-0 bg-muted/10">
        {currentUrl ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={currentUrl}
            title="Sandbox Browser"
            className="h-full w-full bg-background"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Enter a URL above to start browsing.
          </div>
        )}
      </div>
    </div>
  );
}
