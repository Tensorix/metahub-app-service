/**
 * SandboxBrowserTab - mini in-panel browser.
 * Local sandbox addresses are routed through the backend so localhost
 * resolves inside the sandbox instead of the user's machine.
 */

import { useCallback, useMemo, useState } from 'react';
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

interface BrowserHistoryEntry {
  displayUrl: string;
  iframeUrl: string;
  proxyMode: boolean;
}

function isLocalSandboxHostname(hostname: string): boolean {
  const lowered = hostname.trim().toLowerCase();
  if (lowered === 'localhost' || lowered === '0.0.0.0' || lowered === '::1') {
    return true;
  }
  return /^127(?:\.\d{1,3}){3}$/.test(lowered);
}

function shouldProxyThroughSandbox(url: string): boolean {
  try {
    return isLocalSandboxHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

function buildProxyUrl(sessionId: string, url: string): string {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(/:$/, '');
  const host = encodeURIComponent(parsed.host);
  const base = `/api/v1/sessions/${sessionId}/sandbox/browser/${scheme}/${host}`;
  const path = parsed.pathname && parsed.pathname !== '/'
    ? `/${parsed.pathname.replace(/^\/+/, '')}`
    : '';
  return `${base}${path}${parsed.search}${parsed.hash}`;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const localLike = /^(localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?(?:\/|$)/i.test(trimmed);
  return `${localLike ? 'http' : 'https'}://${trimmed}`;
}

async function ensureBrowserProxySession(sessionId: string): Promise<void> {
  const token = localStorage.getItem('access_token');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`/api/v1/sessions/${sessionId}/sandbox/browser/session`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to establish sandbox browser session');
  }
}

export function SandboxBrowserTab({ sessionId }: SandboxBrowserTabProps) {
  const sandboxStatus = useChatStore((s) => s.sandboxStatus);
  const createSandbox = useChatStore((s) => s.createSandbox);
  const current = sandboxStatus[sessionId] ?? null;
  const isRunning = current?.status === 'running';

  const [urlDraft, setUrlDraft] = useState('');
  const [currentEntry, setCurrentEntry] = useState<BrowserHistoryEntry | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [history, setHistory] = useState<BrowserHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [browserError, setBrowserError] = useState('');

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;
  const currentUrl = currentEntry?.iframeUrl ?? '';
  const isProxyMode = currentEntry?.proxyMode ?? false;
  const iframeSandbox = useMemo(
    () => (
      isProxyMode
        ? 'allow-scripts allow-forms allow-popups'
        : 'allow-scripts allow-same-origin allow-forms allow-popups'
    ),
    [isProxyMode],
  );

  const navigateTo = useCallback(
    async (raw: string, pushHistory = true) => {
      const normalized = normalizeUrl(raw);
      if (!normalized) return;
      const proxyMode = shouldProxyThroughSandbox(normalized);
      const iframeUrl = proxyMode ? buildProxyUrl(sessionId, normalized) : normalized;
      if (proxyMode) {
        await ensureBrowserProxySession(sessionId);
      }

      const entry: BrowserHistoryEntry = {
        displayUrl: normalized,
        iframeUrl,
        proxyMode,
      };

      setBrowserError('');
      setCurrentEntry(entry);
      setUrlDraft(normalized);
      setIframeKey((k) => k + 1);
      if (pushHistory) {
        setHistory((prev) => {
          const trimmed = prev.slice(0, historyIndex + 1);
          const next = [...trimmed, entry];
          setHistoryIndex(next.length - 1);
          return next;
        });
      }
    },
    [sessionId, historyIndex],
  );

  const handleGo = useCallback(() => {
    if (!urlDraft.trim()) return;
    void navigateTo(urlDraft).catch((error: unknown) => {
      setBrowserError(error instanceof Error ? error.message : 'Failed to open URL');
    });
  }, [navigateTo, urlDraft]);

  const handleBack = useCallback(() => {
    if (!canGoBack) return;
    const nextIndex = historyIndex - 1;
    const nextEntry = history[nextIndex];
    if (!nextEntry) return;

    void (async () => {
      try {
        if (nextEntry.proxyMode) {
          await ensureBrowserProxySession(sessionId);
        }
        setBrowserError('');
        setHistoryIndex(nextIndex);
        setCurrentEntry(nextEntry);
        setUrlDraft(nextEntry.displayUrl);
        setIframeKey((k) => k + 1);
      } catch (error) {
        setBrowserError(error instanceof Error ? error.message : 'Failed to navigate back');
      }
    })();
  }, [canGoBack, history, historyIndex, sessionId]);

  const handleForward = useCallback(() => {
    if (!canGoForward) return;
    const nextIndex = historyIndex + 1;
    const nextEntry = history[nextIndex];
    if (!nextEntry) return;

    void (async () => {
      try {
        if (nextEntry.proxyMode) {
          await ensureBrowserProxySession(sessionId);
        }
        setBrowserError('');
        setHistoryIndex(nextIndex);
        setCurrentEntry(nextEntry);
        setUrlDraft(nextEntry.displayUrl);
        setIframeKey((k) => k + 1);
      } catch (error) {
        setBrowserError(error instanceof Error ? error.message : 'Failed to navigate forward');
      }
    })();
  }, [canGoForward, history, historyIndex, sessionId]);

  const handleRefresh = useCallback(() => {
    if (!currentUrl) return;
    setBrowserError('');
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
          placeholder="http://localhost:3000 or https://example.com"
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

      <div className="border-b px-2 py-1 text-[11px] text-muted-foreground">
        {isProxyMode
          ? 'Sandbox network mode: localhost resolves inside the sandbox.'
          : 'Direct mode: external URLs still load in the browser directly.'}
      </div>

      {/* Iframe viewport */}
      <div className="flex-1 min-h-0 bg-muted/10">
        {browserError && (
          <div className="border-b bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {browserError}
          </div>
        )}
        {currentUrl ? (
          <iframe
            key={iframeKey}
            src={currentUrl}
            title="Sandbox Browser"
            className="h-full w-full bg-background"
            sandbox={iframeSandbox}
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
