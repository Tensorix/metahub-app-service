/**
 * Tool Call Indicator Component
 *
 * Shows when the AI is calling a tool
 */

import { Loader2, Wrench, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCallIndicatorProps {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  status?: 'calling' | 'success' | 'error';
  className?: string;
}

export function ToolCallIndicator({
  name,
  args,
  result,
  status = 'calling',
  className,
}: ToolCallIndicatorProps) {
  const statusIcon = {
    calling: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    success: <Check className="h-4 w-4 text-green-500" />,
    error: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg',
        'bg-muted/50 border border-border',
        className
      )}
    >
      <div className="shrink-0 mt-0.5">
        <Wrench className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          {statusIcon[status]}
        </div>

        {/* Arguments (collapsible) */}
        {args && Object.keys(args).length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Arguments
            </summary>
            <pre className="mt-1 p-2 text-xs bg-background rounded overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </details>
        )}

        {/* Result */}
        {result && (
          <div className="mt-2">
            <span className="text-xs text-muted-foreground">Result:</span>
            <pre className="mt-1 p-2 text-xs bg-background rounded overflow-x-auto max-h-32">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
