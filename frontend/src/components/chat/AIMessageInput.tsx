/**
 * AI Message Input Component
 *
 * Features:
 * - Auto-resize textarea
 * - Send on Enter (Shift+Enter for newline)
 * - Stop button during generation
 * - Disabled state during streaming
 */

import { useState, useCallback } from 'react';
import { Send, Square } from 'lucide-react';
import { useAIChat } from '@/hooks/useAIChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const { isStreaming, send, stop } = useAIChat();

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

  const isDisabled = disabled || isStreaming;

  return (
    <div className={cn('flex items-end gap-2 p-4 border-t', className)}>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={isDisabled}
        className={cn(
          'flex-1',
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
