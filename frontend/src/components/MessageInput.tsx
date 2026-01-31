/**
 * Unified Message Input Component
 *
 * Features:
 * - Auto-resize textarea (1-6 lines)
 * - Send on Enter (Shift+Enter for newline)
 * - Optional stop button for AI streaming
 * - Smooth animations and transitions
 * - Optional character count indicator
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Send, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  /** Send message handler */
  onSend: (content: string) => Promise<void>;
  /** Optional stop handler for AI streaming */
  onStop?: () => void;
  /** Whether AI is currently streaming (shows stop button) */
  isStreaming?: boolean;
  /** Whether to show character count */
  showCharCount?: boolean;
  /** Max character length */
  maxLength?: number;
  /** Custom placeholder text */
  placeholder?: string;
  /** Disable input */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function MessageInput({
  onSend,
  onStop,
  isStreaming = false,
  showCharCount = false,
  maxLength = 10000,
  placeholder = '输入消息... (Enter 发送, Shift+Enter 换行)',
  disabled = false,
  className,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      // min 44px (single line), max 160px (~6 lines)
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 44), 160);
      textarea.style.height = `${newHeight}px`;
    }
  }, [content]);

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || sending || isStreaming || disabled) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setContent('');
      textareaRef.current?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  }, [content, sending, isStreaming, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStop = () => {
    onStop?.();
  };

  const isDisabled = disabled || sending || isStreaming;
  const charCountVisible = showCharCount && content.length > maxLength * 0.7;
  const charCountWarning = content.length > maxLength * 0.9;

  return (
    <div className={cn('relative', className)}>
      {/* Main input container */}
      <div
        className={cn(
          'flex items-end gap-2 p-3 rounded-xl border bg-background transition-all duration-200',
          isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background border-transparent',
          isDisabled && 'opacity-60'
        )}
      >
        {/* Textarea with auto-resize */}
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isDisabled}
          rows={1}
          className={cn(
            'flex-1 min-h-[44px] max-h-[160px] resize-none border-0 bg-transparent p-0 px-1',
            'focus-visible:ring-0 focus-visible:ring-offset-0',
            'placeholder:text-muted-foreground/60',
            'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent'
          )}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
          {isStreaming && onStop ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              className="h-9 w-9 rounded-lg transition-all duration-200 hover:scale-105"
              aria-label="停止生成"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={!content.trim() || disabled || sending}
              className={cn(
                'h-9 w-9 rounded-lg transition-all duration-200',
                content.trim() && !disabled && !sending && 'hover:scale-105 shadow-sm'
              )}
              aria-label="发送消息"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Status hints and character count */}
      <div className="flex items-center justify-between px-1 mt-1.5">
        <div className="flex items-center gap-2">
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              AI 正在生成...
            </span>
          )}
          {sending && !isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              发送中...
            </span>
          )}
        </div>

        {charCountVisible && (
          <span
            className={cn(
              'text-xs transition-colors duration-200',
              charCountWarning ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {content.length.toLocaleString()}/{maxLength.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}