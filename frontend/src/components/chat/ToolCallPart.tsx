import { useState } from 'react';
import { ChevronRight, Wrench, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { MessagePart } from '@/lib/api';
import { parseToolCallContent, parseToolResultContent } from '@/lib/api';
import { TodoInlineHint, parseTodoArgs } from './TodoVisualization';
import { CodeBlock } from './CodeBlock';
import { collapseVariants } from '@/lib/motion';

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

  if (!callContent) {
    return (
      <div className="my-1.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
        <div className="text-xs text-muted-foreground">Tool Call</div>
        <pre className="mt-1 text-xs whitespace-pre-wrap break-words">{callPart.content}</pre>
      </div>
    );
  }

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
      "my-1.5 rounded-lg overflow-hidden transition-colors",
      isRunning && "border-l-2 border-l-brand border border-border/30 bg-brand/5 shadow-sm shadow-brand/5",
      !isRunning && isSuccess && "border border-border/30 bg-muted/20",
      !isRunning && !isSuccess && "border-l-2 border-l-red-500 border border-red-500/20 bg-red-500/5",
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <Wrench className="h-3.5 w-3.5 text-brand" />
        <span className="text-sm font-medium truncate">{callContent.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
          ) : isSuccess ? (
            <>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              </motion.div>
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
            variants={collapseVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
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
