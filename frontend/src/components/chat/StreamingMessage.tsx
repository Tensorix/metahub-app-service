/**
 * Streaming Message Component
 *
 * Renders markdown content using @lobehub/ui Markdown component.
 * Supports GFM, code highlighting, LaTeX, Mermaid diagrams.
 */

import { useRef, useEffect } from 'react';
import { Markdown } from '@lobehub/ui';
import { cn } from '@/lib/utils';

interface StreamingMessageProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export function StreamingMessage({
  content,
  isStreaming = false,
  className,
}: StreamingMessageProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const hasContent = content.trim().length > 0;

  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [content, isStreaming]);

  return (
    <div className={cn('max-w-none', className)}>
      {hasContent ? (
        <Markdown
          variant="chat"
          animated={isStreaming}
        >
          {content}
        </Markdown>
      ) : (
        isStreaming && <LoadingDots />
      )}
      <div ref={endRef} />
    </div>
  );
}
