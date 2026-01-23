import { Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopicDividerProps {
  topicName: string;
  onClick?: () => void;
}

export function TopicDivider({ topicName, onClick }: TopicDividerProps) {
  return (
    <div
      className={cn(
        'my-4 flex cursor-pointer items-center gap-4 text-xs text-muted-foreground',
        'hover:bg-muted/60 rounded-md px-2 py-2',
      )}
      onClick={onClick}
    >
      <div className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-1">
        <Hash className="h-3 w-3" />
        <span className="max-w-[200px] truncate">{topicName}</span>
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

