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
    <div className="my-2 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-sm text-red-700 dark:text-red-400">
          {errorContent.error}
        </div>
        {errorContent.code && (
          <div className="text-xs text-red-500 mt-1">
            错误码: {errorContent.code}
          </div>
        )}
      </div>
    </div>
  );
}
