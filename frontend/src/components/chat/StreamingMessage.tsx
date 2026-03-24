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

export function StreamingMessage({
  content,
  isStreaming = false,
  className,
}: StreamingMessageProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [content, isStreaming]);

  return (
    <div className={cn('max-w-none', className)}>
      <Markdown
        variant="chat"
        animated={isStreaming}
        fullFeaturedCodeBlock
      >
        {content}
      </Markdown>
      {isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse" />}
      <div ref={endRef} />
    </div>
  );
}
