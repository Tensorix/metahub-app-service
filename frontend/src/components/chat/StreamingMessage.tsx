/**
 * Streaming Message Component
 *
 * Features:
 * - Markdown rendering (simplified)
 * - Typing cursor animation
 */

import { useRef, useEffect } from 'react';
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

  // Auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [content, isStreaming]);

  // Simple markdown-like rendering
  const renderContent = (text: string) => {
    // Split by newlines and render paragraphs
    const lines = text.split('\n');
    return lines.map((line, index) => {
      // Simple markdown formatting
      let processedLine = line;
      
      // Bold: **text**
      processedLine = processedLine.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      
      // Italic: *text*
      processedLine = processedLine.replace(/\*(.+?)\*/g, '<em>$1</em>');
      
      // Code: `code`
      processedLine = processedLine.replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">$1</code>');
      
      // Links: [text](url)
      processedLine = processedLine.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:no-underline">$1</a>');

      if (line.trim() === '') {
        return <br key={index} />;
      }

      return (
        <p key={index} className="my-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: processedLine }} />
      );
    });
  };

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <div>{renderContent(content)}</div>

      {/* Typing cursor */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      )}

      {/* Scroll anchor */}
      <div ref={endRef} />
    </div>
  );
}
