# Step 7: 前端 UI 组件

## 1. 目标

- 实现 AI 消息输入组件
- 实现流式消息渲染组件
- 实现工具调用指示器

## 2. 文件结构

```
frontend/src/components/chat/
├── AIMessageInput.tsx      # AI 输入框组件
├── StreamingMessage.tsx    # 流式消息组件
├── ToolCallIndicator.tsx   # 工具调用指示器
└── RegenerateButton.tsx    # 重新生成按钮
```

## 3. 组件实现

### 3.1 AIMessageInput.tsx

```tsx
/**
 * AI Message Input Component
 *
 * Features:
 * - Auto-resize textarea
 * - Send on Enter (Shift+Enter for newline)
 * - Stop button during generation
 * - Disabled state during streaming
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { useAIChat } from '@/hooks/useAIChat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface AIMessageInputProps {
  className?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

export function AIMessageInput({
  className,
  placeholder = 'Type a message...',
  maxLength = 10000,
  disabled = false,
}: AIMessageInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isStreaming, send, stop } = useAIChat();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || disabled) return;

    setInput('');
    await send(trimmed);
  }, [input, isStreaming, disabled, send]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle stop
  const handleStop = () => {
    stop();
  };

  const isDisabled = disabled || (isStreaming && false); // 允许在生成时输入

  return (
    <div className={cn('flex items-end gap-2 p-4 border-t', className)}>
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={isDisabled}
        rows={1}
        className={cn(
          'min-h-[40px] max-h-[200px] resize-none',
          'flex-1 rounded-lg',
          isDisabled && 'opacity-50'
        )}
      />

      {isStreaming ? (
        <Button
          variant="destructive"
          size="icon"
          onClick={handleStop}
          className="shrink-0"
          aria-label="Stop generation"
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="default"
          size="icon"
          onClick={handleSubmit}
          disabled={!input.trim() || disabled}
          className="shrink-0"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}

      {/* Character count */}
      {input.length > maxLength * 0.8 && (
        <span className="text-xs text-muted-foreground">
          {input.length}/{maxLength}
        </span>
      )}
    </div>
  );
}
```

### 3.2 StreamingMessage.tsx

```tsx
/**
 * Streaming Message Component
 *
 * Features:
 * - Markdown rendering
 * - Code syntax highlighting
 * - Typing cursor animation
 * - Copy code button
 */

import React, { useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StreamingMessageProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export function StreamingMessage({
  content,
  isStreaming = false,
  className,
}: StreamingMessageProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copiedBlock, setCopiedBlock] = React.useState<string | null>(null);

  // Auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [content, isStreaming]);

  // Copy code handler
  const handleCopyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedBlock(id);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  // Markdown components
  const components = useMemo(
    () => ({
      code({
        node,
        inline,
        className: codeClassName,
        children,
        ...props
      }: any) {
        const match = /language-(\w+)/.exec(codeClassName || '');
        const language = match ? match[1] : '';
        const codeString = String(children).replace(/\n$/, '');
        const codeId = `code-${codeString.slice(0, 20)}`;

        if (!inline && language) {
          return (
            <div className="relative group my-4">
              {/* Language badge */}
              <div className="absolute top-0 left-0 px-2 py-1 text-xs text-gray-400 bg-gray-800 rounded-tl rounded-br">
                {language}
              </div>

              {/* Copy button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                onClick={() => handleCopyCode(codeString, codeId)}
              >
                {copiedBlock === codeId ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>

              <SyntaxHighlighter
                style={vscDarkPlus}
                language={language}
                PreTag="div"
                className="rounded-lg !mt-0 !pt-8"
                {...props}
              >
                {codeString}
              </SyntaxHighlighter>
            </div>
          );
        }

        // Inline code
        return (
          <code
            className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono"
            {...props}
          >
            {children}
          </code>
        );
      },

      // Tables
      table({ children }: any) {
        return (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full divide-y divide-border">
              {children}
            </table>
          </div>
        );
      },

      // Links
      a({ href, children }: any) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:no-underline"
          >
            {children}
          </a>
        );
      },

      // Lists
      ul({ children }: any) {
        return <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>;
      },

      ol({ children }: any) {
        return <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>;
      },

      // Paragraphs
      p({ children }: any) {
        return <p className="my-2 leading-relaxed">{children}</p>;
      },

      // Headings
      h1({ children }: any) {
        return <h1 className="text-2xl font-bold my-4">{children}</h1>;
      },
      h2({ children }: any) {
        return <h2 className="text-xl font-bold my-3">{children}</h2>;
      },
      h3({ children }: any) {
        return <h3 className="text-lg font-semibold my-2">{children}</h3>;
      },

      // Blockquotes
      blockquote({ children }: any) {
        return (
          <blockquote className="border-l-4 border-primary/50 pl-4 my-4 italic text-muted-foreground">
            {children}
          </blockquote>
        );
      },
    }),
    [copiedBlock]
  );

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>

      {/* Typing cursor */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
      )}

      {/* Scroll anchor */}
      <div ref={endRef} />
    </div>
  );
}
```

### 3.3 ToolCallIndicator.tsx

```tsx
/**
 * Tool Call Indicator Component
 *
 * Shows when the AI is calling a tool
 */

import React from 'react';
import { Loader2, Wrench, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCallIndicatorProps {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  status?: 'calling' | 'success' | 'error';
  className?: string;
}

export function ToolCallIndicator({
  name,
  args,
  result,
  status = 'calling',
  className,
}: ToolCallIndicatorProps) {
  const statusIcon = {
    calling: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    success: <Check className="h-4 w-4 text-green-500" />,
    error: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg',
        'bg-muted/50 border border-border',
        className
      )}
    >
      <div className="shrink-0 mt-0.5">
        <Wrench className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          {statusIcon[status]}
        </div>

        {/* Arguments (collapsible) */}
        {args && Object.keys(args).length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Arguments
            </summary>
            <pre className="mt-1 p-2 text-xs bg-background rounded overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </details>
        )}

        {/* Result */}
        {result && (
          <div className="mt-2">
            <span className="text-xs text-muted-foreground">Result:</span>
            <pre className="mt-1 p-2 text-xs bg-background rounded overflow-x-auto max-h-32">
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.4 RegenerateButton.tsx

```tsx
/**
 * Regenerate Button Component
 *
 * Allows regenerating an AI response
 */

import React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAIChat } from '@/hooks/useAIChat';

interface RegenerateButtonProps {
  messageId: string;
  disabled?: boolean;
}

export function RegenerateButton({
  messageId,
  disabled = false,
}: RegenerateButtonProps) {
  const { isStreaming, regenerate } = useAIChat();
  const [isRegenerating, setIsRegenerating] = React.useState(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerate(messageId);
    } finally {
      setIsRegenerating(false);
    }
  };

  const isDisabled = disabled || isStreaming || isRegenerating;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRegenerate}
          disabled={isDisabled}
          className="h-8 w-8"
        >
          {isRegenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Regenerate response</TooltipContent>
    </Tooltip>
  );
}
```

## 4. 消息列表组件

### 4.1 AIMessageList.tsx

```tsx
/**
 * AI Message List Component
 *
 * Renders the chat message list with streaming support
 */

import React from 'react';
import { useChatStore } from '@/store/chat';
import { useAIChat } from '@/hooks/useAIChat';
import { StreamingMessage } from './StreamingMessage';
import { ToolCallIndicator } from './ToolCallIndicator';
import { RegenerateButton } from './RegenerateButton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

export function AIMessageList() {
  const messages = useChatStore((state) => state.messages);
  const { isStreaming, streamingMessageId, activeToolCall } = useAIChat();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        const isCurrentStreaming = message.id === streamingMessageId;
        const content = message.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.content)
          .join('');

        return (
          <div
            key={message.id}
            className={cn(
              'flex gap-3',
              isUser && 'flex-row-reverse'
            )}
          >
            {/* Avatar */}
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback>
                {isUser ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </AvatarFallback>
            </Avatar>

            {/* Message content */}
            <div
              className={cn(
                'flex flex-col max-w-[80%]',
                isUser && 'items-end'
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-2',
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{content}</p>
                ) : (
                  <StreamingMessage
                    content={content}
                    isStreaming={isCurrentStreaming}
                  />
                )}
              </div>

              {/* Actions for AI messages */}
              {!isUser && !isCurrentStreaming && (
                <div className="flex gap-1 mt-1">
                  <RegenerateButton messageId={message.id} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Tool call indicator */}
      {activeToolCall && (
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback>
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <ToolCallIndicator
            name={activeToolCall.name}
            args={activeToolCall.args}
            status="calling"
            className="max-w-[80%]"
          />
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <Bot className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">Start a conversation</p>
          <p className="text-sm">Ask me anything!</p>
        </div>
      )}
    </div>
  );
}
```

## 5. 完整聊天页面

### 5.1 AIChatPage.tsx

```tsx
/**
 * AI Chat Page Component
 */

import React from 'react';
import { AIMessageList } from '@/components/chat/AIMessageList';
import { AIMessageInput } from '@/components/chat/AIMessageInput';
import { useAIChat } from '@/hooks/useAIChat';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AIChatPage() {
  const { error, clearError } = useAIChat();

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <Alert variant="destructive" className="m-4 mb-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex-1">{error}</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearError}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Message list */}
      <AIMessageList />

      {/* Input */}
      <AIMessageInput />
    </div>
  );
}
```

## 6. 依赖安装

```bash
cd frontend
npm install react-markdown remark-gfm react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

## 7. 样式优化

### 7.1 Tailwind 配置

```js
// tailwind.config.js
module.exports = {
  // ...
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
```

### 7.2 全局样式

```css
/* globals.css */
@layer utilities {
  .prose pre {
    @apply bg-transparent p-0;
  }

  .prose code {
    @apply before:content-none after:content-none;
  }
}
```

## 8. 测试

```tsx
// frontend/src/components/chat/__tests__/AIMessageInput.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AIMessageInput } from '../AIMessageInput';

describe('AIMessageInput', () => {
  it('renders input and send button', () => {
    render(<AIMessageInput />);

    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<AIMessageInput />);

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeDisabled();
  });

  it('enables send button when input has content', () => {
    render(<AIMessageInput />);

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello' } });

    const button = screen.getByRole('button', { name: /send/i });
    expect(button).not.toBeDisabled();
  });
});
```

## 9. 下一步

完成 UI 组件后，进入 [08-INTEGRATION.md](./08-INTEGRATION.md) 进行集成测试。
