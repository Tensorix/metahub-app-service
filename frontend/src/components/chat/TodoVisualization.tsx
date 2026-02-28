/**
 * Todo Visualization Components
 *
 * FloatingTodo:  Sticky card pinned to the top of the chat scroll container.
 *                Extracts the latest write_todos state from all messages and
 *                renders a live task-progress card.
 *
 * TodoInlineHint: Compact, single-line indicator rendered inside the message
 *                 stream where the write_todos tool call appeared.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Circle,
  CircleDot,
  CheckCircle2,
  ListTodo,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/api';
import { parseToolCallContent } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ── Helpers ────────────────────────────────────────────────────────

/** Try to extract TodoItem[] from a write_todos tool-call's args. */
export function parseTodoArgs(
  args: Record<string, unknown>,
): TodoItem[] | null {
  const raw = args.todos;
  if (!Array.isArray(raw)) return null;

  const items: TodoItem[] = [];
  for (const item of raw) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).content === 'string' &&
      typeof (item as Record<string, unknown>).status === 'string' &&
      ['pending', 'in_progress', 'completed'].includes(
        (item as Record<string, unknown>).status as string,
      )
    ) {
      items.push({
        content: (item as Record<string, unknown>).content as string,
        status: (item as Record<string, unknown>).status as TodoItem['status'],
      });
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Walk all messages and return the latest TodoItem[] from the most-recent
 * write_todos tool call.  Returns null when no todos have been written yet.
 */
export function extractLatestTodos(messages: Message[]): TodoItem[] | null {
  let latest: TodoItem[] | null = null;

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.parts) {
      if (part.type !== 'tool_call') continue;
      try {
        const call = parseToolCallContent(part);
        if (call?.name === 'write_todos') {
          const parsed = parseTodoArgs(call.args);
          if (parsed) latest = parsed;
        }
      } catch {
        // ignore
      }
    }
  }

  return latest;
}

// ── Status configuration ───────────────────────────────────────────

const statusConfig = {
  pending: {
    icon: Circle,
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
    border: 'border-muted-foreground/20',
  },
  in_progress: {
    icon: CircleDot,
    color: 'text-blue-500',
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
  },
};

// ── Sub-components ─────────────────────────────────────────────────

function ProgressBar({ todos }: { todos: TodoItem[] }) {
  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {completed}/{total} 已完成
          {inProgress > 0 && (
            <span className="text-blue-500 ml-1.5">· {inProgress} 进行中</span>
          )}
        </span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              percent === 100
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function TodoItemRow({ todo, index }: { todo: TodoItem; index: number }) {
  const config = statusConfig[todo.status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className={cn(
        'flex items-start gap-2 px-2.5 py-1.5 rounded-md border transition-colors',
        config.bg,
        config.border,
      )}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className={cn('h-3.5 w-3.5', config.color)} />
      </div>
      <span
        className={cn(
          'text-xs leading-relaxed break-words',
          todo.status === 'completed' && 'line-through text-muted-foreground',
        )}
      >
        {todo.content}
      </span>
    </motion.div>
  );
}

// ── FloatingTodo ───────────────────────────────────────────────────

interface FloatingTodoProps {
  messages: Message[];
  isStreaming?: boolean;
  className?: string;
}

/**
 * Sticky todo card rendered at the top of the chat scroll container.
 * Automatically extracts the latest todos from messages.
 */
export function FloatingTodo({
  messages,
  isStreaming,
  className,
}: FloatingTodoProps) {
  const [collapsed, setCollapsed] = useState(false);

  const todos = useMemo(() => extractLatestTodos(messages), [messages]);

  const sortedTodos = useMemo(() => {
    if (!todos || todos.length === 0) return [];
    const order = { in_progress: 0, pending: 1, completed: 2 };
    return [...todos].sort((a, b) => order[a.status] - order[b.status]);
  }, [todos]);

  if (!todos || todos.length === 0) return null;

  const allCompleted = todos.every((t) => t.status === 'completed');

  return (
    <div
      className={cn(
        'sticky top-0 z-20 mx-auto w-full max-w-md',
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn(
          'rounded-xl border shadow-lg backdrop-blur-md overflow-hidden',
          'bg-card/95 dark:bg-card/90',
          allCompleted && !isStreaming && 'border-emerald-500/30',
        )}
      >
        {/* Header — always visible, acts as collapse toggle */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors"
        >
          <ListTodo className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">任务计划</span>

          {/* Compact progress when collapsed */}
          <span className="ml-auto flex items-center gap-2">
            {isStreaming && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground animate-pulse">
                更新中
              </span>
            )}
            <CompactProgress todos={todos} />
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        </button>

        {/* Expandable body */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="todo-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-1">
                <ProgressBar todos={todos} />
              </div>
              <div className="px-3 pb-3 pt-1.5 space-y-1 max-h-56 overflow-y-auto">
                {sortedTodos.map((todo, index) => (
                  <TodoItemRow
                    key={`${todo.content}-${todo.status}`}
                    todo={todo}
                    index={index}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── CompactProgress ────────────────────────────────────────────────

function CompactProgress({ todos }: { todos: TodoItem[] }) {
  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {completed}/{total}
    </span>
  );
}

// ── TodoInlineHint ─────────────────────────────────────────────────

interface TodoInlineHintProps {
  todos: TodoItem[];
  hasResult: boolean;
}

/**
 * Compact, single-line indicator shown inside the message stream where the
 * write_todos call originally appeared.  The full card is at the top of the
 * viewport, so this just shows a brief status summary.
 */
export function TodoInlineHint({ todos, hasResult }: TodoInlineHintProps) {
  const completed = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const total = todos.length;

  return (
    <div className="my-1.5 flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/20 text-xs text-muted-foreground">
      <ListTodo className="h-3.5 w-3.5 text-primary shrink-0" />
      <span>
        已更新任务计划
        <span className="mx-1">·</span>
        <span className="tabular-nums">{completed}/{total}</span> 已完成
        {inProgress > 0 && (
          <>
            <span className="mx-1">·</span>
            <span className="text-blue-500 tabular-nums">{inProgress}</span> 进行中
          </>
        )}
      </span>
      {!hasResult && (
        <span className="ml-auto animate-pulse text-[10px] uppercase tracking-widest">
          执行中
        </span>
      )}
    </div>
  );
}
