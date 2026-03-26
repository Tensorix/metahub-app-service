/**
 * Streaming Message Component
 *
 * Renders markdown content using @lobehub/ui Markdown component.
 * Supports GFM, code highlighting, LaTeX, Mermaid diagrams.
 */

import { useRef, useEffect } from 'react';
import { Markdown } from '@lobehub/ui';
import { cn } from '@/lib/utils';
import { LoadingDots } from './LoadingDots';

interface StreamingMessageProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
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
