import { useState } from 'react';
import { Bot, ChevronRight, CheckCircle, XCircle, Loader2, Clock, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { StreamingMessage } from './StreamingMessage';
import { LoadingDots } from './LoadingDots';
import type { SubAgentCallContent } from '@/lib/api';
import { collapseVariants } from '@/lib/motion';

interface SubAgentCallPartProps {
  data: SubAgentCallContent;
  isStreaming?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SubAgentCallPart({ data }: SubAgentCallPartProps) {
  const isRunning = data.status === 'running';
  const isError = data.status === 'error';
  const isComplete = data.status === 'success' || (!data.status && data.result);
  const [expanded, setExpanded] = useState(isRunning);

  return (
    <div className={cn(
      "my-1.5 rounded-lg border overflow-hidden transition-colors",
      isRunning && "border-brand/30 bg-brand/5",
      isComplete && "border-border bg-muted/30",
      isError && "border-red-500/30 bg-red-500/5",
      !isRunning && !isComplete && !isError && "border-border bg-muted/30",
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <Bot className="h-3.5 w-3.5 text-brand" />
        <span className="bg-brand/8 px-1.5 py-0.5 rounded text-brand text-sm font-semibold">{data.name}</span>
        <span className="text-xs text-muted-foreground flex-1 truncate text-left">{data.description}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
          ) : isComplete ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              {data.duration_ms > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {formatDuration(data.duration_ms)}
                </span>
              )}
            </>
          ) : isError ? (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>

      {/* Body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={collapseVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="px-3 pb-3 border-t relative">
              {/* Connecting line for child events */}
              <div className="absolute left-4 top-8 bottom-2 w-px bg-border" />
              <ChildEventsBody data={data} isRunning={isRunning} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders the interleaved body of a subagent card.
 *
 * Priority: child_events (text + tool calls interleaved) > streaming_text > result
 */
function ChildEventsBody({ data, isRunning }: { data: SubAgentCallContent; isRunning: boolean }) {
  const childEvents = data.child_events;
  const hasChildren = childEvents && childEvents.length > 0;

  if (hasChildren) {
    // Find index of the last text child for streaming cursor
    let lastTextIdx = -1;
    for (let i = childEvents.length - 1; i >= 0; i--) {
      if (childEvents[i].type === 'text') { lastTextIdx = i; break; }
    }
    const lastIsText = childEvents[childEvents.length - 1]?.type === 'text';

    return (
      <div className="space-y-1.5 pt-2">
        {childEvents.map((child, idx) => {
          switch (child.type) {
            case 'text':
              return (
                <div key={idx} className="text-sm">
                  <StreamingMessage
                    content={child.content || ''}
                    isStreaming={isRunning && idx === lastTextIdx}
                  />
                </div>
              );
            case 'tool_call': {
              const matchResult = childEvents.find(
                (c) => c.type === 'tool_result' && c.op_id === child.op_id,
              );
              return (
                <MiniToolCall
                  key={idx}
                  name={child.name || 'unknown'}
                  args={child.args}
                  result={matchResult}
                />
              );
            }
            case 'tool_result':
              return null; // paired inside tool_call
            default:
              return null;
          }
        })}
        {isRunning && !lastIsText && <RunningAnimation />}
      </div>
    );
  }

  // Fallback: no child_events yet
  if (isRunning) {
    return data.streaming_text
      ? <div className="pt-2"><StreamingMessage content={data.streaming_text} isStreaming={true} /></div>
      : <RunningAnimation />;
  }

  // Completed with no child_events — show final result
  if (data.result) {
    return (
      <div className="pt-2 text-sm">
        <StreamingMessage content={data.result} isStreaming={false} />
      </div>
    );
  }

  return null;
}

function RunningAnimation() {
  return <LoadingDots className="py-3 px-2" />;
}

function MiniToolCall({ name, args, result }: { name: string; args?: Record<string, unknown>; result?: any }) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = !!result;

  return (
    <div className="rounded border bg-muted/20 overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <ChevronRight className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-90")} />
        <Wrench className="h-3 w-3 text-brand shrink-0" />
        <span className="font-medium truncate">{name}</span>
        {hasResult ? (
          <CheckCircle className="h-3 w-3 text-emerald-500 ml-auto shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-brand ml-auto shrink-0" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div variants={collapseVariants} initial="hidden" animate="visible" exit="exit">
            <div className="px-2 pb-2 border-t space-y-1">
              {args && (
                <div>
                  <span className="text-[10px] text-muted-foreground">参数</span>
                  <pre className="bg-muted/30 rounded p-1 overflow-x-auto text-[10px]">
                    {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              )}
              {result && (
                <div>
                  <span className="text-[10px] text-muted-foreground">结果</span>
                  <pre className="bg-muted/30 rounded p-1 overflow-x-auto text-[10px] max-h-24">
                    {typeof result.result === 'string' ? result.result : JSON.stringify(result)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
