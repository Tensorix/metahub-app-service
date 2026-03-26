import { Hash } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface TopicDividerProps {
  topicName: string;
  onClick?: () => void;
}

export function TopicDivider({ topicName, onClick }: TopicDividerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.8 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
      className={cn(
        'my-4 flex cursor-pointer items-center gap-4 text-xs text-muted-foreground',
        'hover:bg-surface-hover rounded-lg px-2 py-2 transition-colors duration-150',
      )}
      onClick={onClick}
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="flex items-center gap-1">
        <Hash className="h-3 w-3" />
        <span className="max-w-[200px] truncate">{topicName}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
    </motion.div>
  );
}

