import { AlertCircle } from 'lucide-react';
import type { MessagePart } from '@/lib/api';
import { parseErrorContent } from '@/lib/api';

interface ErrorPartProps {
  part: MessagePart;
}

export function ErrorPart({ part }: ErrorPartProps) {
  const errorContent = parseErrorContent(part);

  if (!errorContent) return null;

  return (
    <div className="my-1.5 rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm text-red-600 dark:text-red-400">{errorContent.error}</p>
          {errorContent.code && (
            <span className="text-[10px] text-red-400 font-mono">{errorContent.code}</span>
          )}
        </div>
      </div>
    </div>
  );
}
