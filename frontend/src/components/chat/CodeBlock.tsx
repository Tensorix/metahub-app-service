import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  content: string;
  maxHeight?: number;
  className?: string;
}

export function CodeBlock({ content, maxHeight = 160, className }: CodeBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const needsExpand = content.length > 500;

  return (
    <div className={cn("relative", className)}>
      <pre
        className={cn(
          "text-xs font-mono bg-muted/50 rounded-md p-2 overflow-x-auto",
          !expanded && needsExpand && "overflow-hidden",
        )}
        style={!expanded && needsExpand ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        {content}
      </pre>
      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "text-xs text-primary text-center w-full py-1",
            !expanded && "absolute bottom-0 inset-x-0 bg-gradient-to-t from-muted/80 to-transparent pt-6 pb-1",
          )}
        >
          {expanded ? '收起' : '展开全部'}
        </button>
      )}
    </div>
  );
}
