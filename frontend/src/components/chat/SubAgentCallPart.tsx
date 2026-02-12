import { useState } from 'react';
import { Bot, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StreamingMessage } from './StreamingMessage';
import type { SubAgentCallContent } from '@/lib/api';

interface SubAgentCallPartProps {
  data: SubAgentCallContent;
}

export function SubAgentCallPart({ data }: SubAgentCallPartProps) {
  const [expanded, setExpanded] = useState(false);
  const durationMs = Number.isFinite(data.duration_ms) ? data.duration_ms : 0;

  const durationDisplay = durationMs < 1000
    ? `${durationMs}ms`
    : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <div className="rounded-lg border bg-muted/30 my-1 overflow-hidden">
      {/* Header - 始终可见 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-primary">{data.name}</span>
        <span className="text-xs text-muted-foreground flex-1 truncate text-left">
          {data.description}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {durationDisplay}
        </span>
        {data.status && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
            {data.status}
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Body - 可展开 */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t">
          <div className="pt-2 text-sm">
            <StreamingMessage content={data.result} isStreaming={false} />
          </div>
        </div>
      )}
    </div>
  );
}
