/**
 * AI Chat Page Component
 */

import { AIMessageList } from './AIMessageList';
import { AIMessageInput } from './AIMessageInput';
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
