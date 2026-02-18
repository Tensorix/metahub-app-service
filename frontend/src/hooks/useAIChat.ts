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
    pendingInterrupt,
    sendAIMessage,
    stopGeneration,
    regenerateMessage,
    clearStreamState,
    sendResumeDecisions,
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

  const resumeApprove = useCallback(
    () => pendingInterrupt && sendResumeDecisions(pendingInterrupt.action_requests.map(() => ({ type: 'approve' }))),
    [pendingInterrupt, sendResumeDecisions]
  );
  const resumeReject = useCallback(
    () => pendingInterrupt && sendResumeDecisions(pendingInterrupt.action_requests.map(() => ({ type: 'reject' }))),
    [pendingInterrupt, sendResumeDecisions]
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
    pendingInterrupt,

    // Actions
    send,
    stop,
    regenerate,
    clearError: clearStreamState,
    resumeApprove,
    resumeReject,
  };
}
