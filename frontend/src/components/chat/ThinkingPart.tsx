import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Loader2 } from 'lucide-react';
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
    <div className="my-2 border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden">
      {/* 头部：可点击展开/折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-purple-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-purple-500" />
        )}

        {isStreaming ? (
          <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
        ) : (
          <Brain className="w-4 h-4 text-purple-500" />
        )}

        <span className="font-medium text-sm text-purple-700 dark:text-purple-300">
          思考过程
        </span>

        {!expanded && (
          <span className="text-xs text-purple-500 ml-auto truncate max-w-[200px]">
            {preview}
          </span>
        )}
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-1" />
          )}
        </div>
      )}
    </div>
  );
}
