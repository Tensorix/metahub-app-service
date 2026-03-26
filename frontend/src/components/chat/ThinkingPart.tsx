import { useState } from 'react';
import { ChevronRight, Brain, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { MessagePart } from '@/lib/api';
import { collapseVariants } from '@/lib/motion';

interface ThinkingPartProps {
  part: MessagePart;
  isStreaming?: boolean;
}

export function ThinkingPart({ part, isStreaming = false }: ThinkingPartProps) {
  const [expanded, setExpanded] = useState(false);

  const content = part.content || '';
  const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "my-1.5 rounded-lg border-l-2 border border-border/30 bg-brand/5 overflow-hidden",
        isStreaming ? "border-l-brand" : "border-l-brand/50"
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-brand/10 transition-colors duration-150"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-brand transition-transform", expanded && "rotate-90")} />
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 text-brand animate-spin" />
        ) : (
          <Brain className="h-3.5 w-3.5 text-brand" />
        )}
        <span className="text-sm font-medium text-brand">思考过程</span>
        {!expanded && (
          <span className="text-xs text-brand/60 ml-auto truncate max-w-[200px]">{preview}</span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={collapseVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="px-3 pb-3 border-t border-brand/10">
              <div className="pt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {content}
                {isStreaming && <span className="inline-block w-1.5 h-4 bg-brand animate-pulse ml-0.5" />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
