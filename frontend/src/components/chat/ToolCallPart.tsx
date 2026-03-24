import { useState } from 'react';
import { ChevronRight, Wrench, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { MessagePart } from '@/lib/api';
import { parseToolCallContent, parseToolResultContent } from '@/lib/api';
import { TodoInlineHint, parseTodoArgs } from './TodoVisualization';
import { CodeBlock } from './CodeBlock';

interface ToolCallPartProps {
  callPart: MessagePart;
  resultPart?: MessagePart;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallPart({ callPart, resultPart }: ToolCallPartProps) {
  const [expanded, setExpanded] = useState(false);

  const callContent = parseToolCallContent(callPart);
  const resultContent = resultPart ? parseToolResultContent(resultPart) : null;

  if (!callContent) return null;

  const isRunning = !resultContent;
  const isSuccess = resultContent?.success ?? true;

  // write_todos: compact inline hint
  if (callContent.name === 'write_todos') {
    const todoItems = parseTodoArgs(callContent.args);
    if (todoItems) {
      return <TodoInlineHint todos={todoItems} hasResult={!isRunning} />;
    }
  }

  return (
    <div className={cn(
      "my-1.5 rounded-lg border overflow-hidden transition-colors",
      isRunning && "border-blue-500/30 bg-blue-500/5",
      !isRunning && isSuccess && "border-border bg-muted/30",
      !isRunning && !isSuccess && "border-red-500/30 bg-red-500/5",
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <Wrench className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-sm font-medium truncate">{callContent.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : isSuccess ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              {resultContent.duration_ms != null && resultContent.duration_ms > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatDuration(resultContent.duration_ms)}
                </span>
              )}
            </>
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          )}
        </span>
      </button>

      {/* Expandable body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="px-3 pb-3 border-t space-y-2">
              <div className="pt-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">参数</span>
                <CodeBlock content={JSON.stringify(callContent.args, null, 2)} />
              </div>
              {resultContent && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">结果</span>
                  <CodeBlock
                    content={resultContent.result}
                    className={cn(!isSuccess && "border-red-500/20")}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
