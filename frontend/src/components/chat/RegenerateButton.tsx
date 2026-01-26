/**
 * Regenerate Button Component
 *
 * Allows regenerating an AI response
 */

import React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <Button
      variant="ghost"
      size="icon"
      onClick={handleRegenerate}
      disabled={isDisabled}
      className="h-8 w-8"
      title="Regenerate response"
    >
      {isRegenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
    </Button>
  );
}
