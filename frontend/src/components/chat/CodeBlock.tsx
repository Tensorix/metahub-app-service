import { useState, useCallback } from 'react';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  content: string;
  maxHeight?: number;
  className?: string;
}

export function CodeBlock({ content, maxHeight = 160, className }: CodeBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const needsExpand = content.length > 500;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [content]);

  return (
    <div className={cn("relative rounded-md border bg-muted/30 overflow-hidden", className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground">
        <span className="font-mono">code</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 hover:bg-muted"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre
        className={cn(
          "text-xs font-mono p-2 overflow-x-auto",
          !expanded && needsExpand && "overflow-hidden",
        )}
        style={!expanded && needsExpand ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        {content}
      </pre>
      {!expanded && needsExpand && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-muted/90 to-transparent pt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            className="w-full h-7 text-xs rounded-none"
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            展开全部
          </Button>
        </div>
      )}
      {expanded && needsExpand && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          className="w-full h-7 text-xs border-t rounded-none"
        >
          <ChevronUp className="h-3 w-3 mr-1" />
          收起
        </Button>
      )}
    </div>
  );
}
