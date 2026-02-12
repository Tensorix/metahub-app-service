import { useCallback } from 'react';
import { useChatStore } from '@/store/chat';

/**
 * Hook for AI chat functionality
 */
export function useAIChat() {
  const {
    isStreaming,
    streamingContent,
    streamingThinking,
    isThinking,
    streamingMessageId,
    activeOperations,
    pendingParts,
    streamError,
    sendAIMessage,
    stopGeneration,
    regenerateMessage,
    clearStreamState,
  } = useChatStore();

  const send = useCallback(
    async (content: string) => {
      if (isStreaming) {
        console.warn('Already streaming');
        return;
      }
      await sendAIMessage(content);
    },
    [isStreaming, sendAIMessage]
  );

  const stop = useCallback(() => {
    stopGeneration();
  }, [stopGeneration]);

  const regenerate = useCallback(
    async (messageId: string) => {
      if (isStreaming) {
        console.warn('Already streaming');
        return;
      }
      await regenerateMessage(messageId);
    },
    [isStreaming, regenerateMessage]
  );

  return {
    // State
    isStreaming,
    streamingContent,
    streamingThinking,
    isThinking,
    streamingMessageId,
    activeOperations,
    pendingParts,
    error: streamError,

    // Actions
    send,
    stop,
    regenerate,
    clearError: clearStreamState,
  };
}
