import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle } from 'lucide-react';
import type { MessagePart } from '@/lib/api';
import { parseToolCallContent, parseToolResultContent } from '@/lib/api';
import { TodoInlineHint, parseTodoArgs } from './TodoVisualization';

interface ToolCallPartProps {
  callPart: MessagePart;
  resultPart?: MessagePart;
}

export function ToolCallPart({ callPart, resultPart }: ToolCallPartProps) {
  const [expanded, setExpanded] = useState(false);

  const callContent = parseToolCallContent(callPart);
  const resultContent = resultPart ? parseToolResultContent(resultPart) : null;

  if (!callContent) return null;

  const hasResult = !!resultContent;
  const isSuccess = resultContent?.success ?? true;

  // write_todos: show compact inline hint (full card is floating at the top)
  if (callContent.name === 'write_todos') {
    const todoItems = parseTodoArgs(callContent.args);
    if (todoItems) {
      return <TodoInlineHint todos={todoItems} hasResult={hasResult} />;
    }
  }

  return (
    <div className="my-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* 头部：可点击展开/折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}

        <Wrench className="w-4 h-4 text-blue-500" />

        <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
          {callContent.name}
        </span>

        {/* 状态指示 */}
        {hasResult ? (
          isSuccess ? (
            <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500 ml-auto" />
          )
        ) : (
          <span className="ml-auto text-xs text-gray-400">执行中...</span>
        )}
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 py-2 text-sm">
          {/* 参数 */}
          <div className="mb-2">
            <div className="text-xs text-gray-500 mb-1">参数:</div>
            <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto">
              {JSON.stringify(callContent.args, null, 2)}
            </pre>
          </div>

          {/* 结果 */}
          {resultContent && (
            <div>
              <div className="text-xs text-gray-500 mb-1">结果:</div>
              <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto max-h-40">
                {resultContent.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
