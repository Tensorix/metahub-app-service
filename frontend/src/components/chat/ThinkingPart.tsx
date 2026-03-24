import { useState } from 'react';
import { ChevronRight, Brain, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { MessagePart } from '@/lib/api';

interface ThinkingPartProps {
  part: MessagePart;
  isStreaming?: boolean;
}

export function ThinkingPart({ part, isStreaming = false }: ThinkingPartProps) {
  const [expanded, setExpanded] = useState(false);

  const content = part.content || '';
  const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;

  return (
    <div className="my-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-500/10 transition-colors"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-purple-500 transition-transform", expanded && "rotate-90")} />
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 text-purple-500 animate-spin" />
        ) : (
          <Brain className="h-3.5 w-3.5 text-purple-500" />
        )}
        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">思考过程</span>
        {!expanded && (
          <span className="text-xs text-purple-400 ml-auto truncate max-w-[200px]">{preview}</span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="px-3 pb-3 border-t border-purple-500/10">
              <div className="pt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {content}
                {isStreaming && <span className="inline-block w-1.5 h-4 bg-purple-500 animate-pulse ml-0.5" />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
