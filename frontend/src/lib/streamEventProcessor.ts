/**
 * Stream Event Processor
 *
 * Pure function module that transforms SSE events into immutable message updates.
 * Zero external dependencies — testable in isolation.
 */

import type { Message, MessagePart } from '@/lib/api';
import type { ChatEvent } from '@/types/agent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamProcessorState {
  textPartIndex: number;
  activeOpIds: Set<string>;
}

export interface ProcessResult {
  message: Message;
  state: StreamProcessorState;
  effects: {
    isThinking?: boolean;
    interrupt?: {
      action_requests: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
      review_configs: Array<{ action_name: string; allowed_decisions?: string[] }>;
    };
    error?: string;
    done?: boolean;
    doneStatus?: string;
  };
}

export function createInitialState(): StreamProcessorState {
  return { textPartIndex: 0, activeOpIds: new Set() };
}

// ---------------------------------------------------------------------------
// Helper: immutable message update
// ---------------------------------------------------------------------------

function updateMessageParts(message: Message, updater: (parts: MessagePart[]) => MessagePart[]): Message {
  return { ...message, parts: updater([...message.parts]) };
}

function findPartById(parts: MessagePart[], id: string): number {
  return parts.findIndex((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

export function processStreamEvent(
  message: Message,
  event: ChatEvent,
  state: StreamProcessorState,
): ProcessResult {
  const effects: ProcessResult['effects'] = {};

  switch (event.event) {
    // ----- text chunk -----
    case 'message': {
      const content = event.data.content || '';
      const parentOpId = (event.data as any).parent_op_id as string | undefined;

      if (parentOpId) {
        // Subagent child text — append to the subagent_call part's streaming_text
        const updated = updateSubagentStreamingText(message, parentOpId, content);
        return { message: updated, state, effects };
      }

      const textPartId = `${message.id}-text-${state.textPartIndex}`;
      const updated = updateMessageParts(message, (parts) => {
        const idx = findPartById(parts, textPartId);
        if (idx === -1) {
          parts.push({
            id: textPartId,
            message_id: message.id,
            type: 'text',
            content,
            created_at: new Date().toISOString(),
          });
        } else {
          parts[idx] = { ...parts[idx], content: parts[idx].content + content };
        }
        return parts;
      });
      return { message: updated, state, effects };
    }

    // ----- thinking -----
    case 'thinking': {
      const content = event.data.content || '';
      effects.isThinking = true;

      const updated = updateMessageParts(message, (parts) => {
        const idx = parts.findIndex((p) => p.type === 'thinking');
        if (idx === -1) {
          // Insert thinking at the beginning
          parts.unshift({
            id: `${message.id}-thinking`,
            message_id: message.id,
            type: 'thinking',
            content,
            created_at: new Date().toISOString(),
          });
        } else {
          parts[idx] = { ...parts[idx], content: parts[idx].content + content };
        }
        return parts;
      });
      return { message: updated, state, effects };
    }

    // ----- operation start -----
    case 'operation_start': {
      const { op_id, op_type, name, args, description, started_at } = event.data;
      const parentOpId = (event.data as any).parent_op_id as string | undefined;
      if (!op_id || !op_type) return { message, state, effects };

      if (parentOpId) {
        // Child tool call inside subagent
        const updated = appendSubagentChildEvent(message, parentOpId, {
          type: 'tool_call',
          op_id,
          name,
          args: args || {},
        });
        return { message: updated, state, effects };
      }

      // Flush current text part and start a new one
      const newState: StreamProcessorState = {
        textPartIndex: state.textPartIndex + 1,
        activeOpIds: new Set([...state.activeOpIds, op_id]),
      };

      if (op_type === 'tool') {
        const updated = updateMessageParts(message, (parts) => {
          parts.push({
            id: `${message.id}-tc-${op_id}`,
            message_id: message.id,
            type: 'tool_call',
            content: JSON.stringify({ op_id, name, args: args || {} }),
            metadata: { timestamp: new Date().toISOString() },
            created_at: new Date().toISOString(),
          });
          return parts;
        });
        return { message: updated, state: newState, effects };
      }

      // subagent start — create a subagent_call part with status: running
      const updated = updateMessageParts(message, (parts) => {
        parts.push({
          id: `${message.id}-sa-${op_id}`,
          message_id: message.id,
          type: 'subagent_call',
          content: JSON.stringify({
            op_id,
            name,
            description: description || '',
            result: '',
            duration_ms: 0,
            status: 'running',
            streaming_text: '',
            child_events: [],
          }),
          metadata: { timestamp: started_at || new Date().toISOString() },
          created_at: new Date().toISOString(),
        });
        return parts;
      });
      return { message: updated, state: newState, effects };
    }

    // ----- operation end -----
    case 'operation_end': {
      const { op_id, op_type, name, result, success, duration_ms, status } = event.data;
      const parentOpId = (event.data as any).parent_op_id as string | undefined;
      if (!op_id) return { message, state, effects };

      if (parentOpId) {
        // Child tool result inside subagent
        const updated = appendSubagentChildEvent(message, parentOpId, {
          type: 'tool_result',
          op_id,
          name,
          result: result || '',
          success: success ?? true,
        });
        return { message: updated, state, effects };
      }

      const newActiveOpIds = new Set(state.activeOpIds);
      newActiveOpIds.delete(op_id);
      const newState: StreamProcessorState = { ...state, activeOpIds: newActiveOpIds };

      const effectiveType = op_type || 'tool';

      if (effectiveType === 'tool') {
        const updated = updateMessageParts(message, (parts) => {
          parts.push({
            id: `${message.id}-tr-${op_id}`,
            message_id: message.id,
            type: 'tool_result',
            content: JSON.stringify({
              op_id,
              name,
              result: result || '',
              success: success ?? true,
              duration_ms: duration_ms ?? 0,
              status,
            }),
            metadata: { timestamp: new Date().toISOString() },
            created_at: new Date().toISOString(),
          });
          return parts;
        });
        return { message: updated, state: newState, effects };
      }

      // subagent end — update existing subagent_call part
      const updated = updateMessageParts(message, (parts) => {
        const saPartId = `${message.id}-sa-${op_id}`;
        const idx = findPartById(parts, saPartId);
        if (idx !== -1) {
          // Update existing subagent_call part
          try {
            const existing = JSON.parse(parts[idx].content);
            parts[idx] = {
              ...parts[idx],
              content: JSON.stringify({
                ...existing,
                result: result || '',
                duration_ms: duration_ms ?? 0,
                status: status || (success ? 'success' : 'error'),
                streaming_text: undefined, // clear streaming text
              }),
            };
          } catch {
            // If parsing fails, create a new content
            parts[idx] = {
              ...parts[idx],
              content: JSON.stringify({
                op_id,
                name,
                description: '',
                result: result || '',
                duration_ms: duration_ms ?? 0,
                status: status || (success ? 'success' : 'error'),
              }),
            };
          }
        } else {
          // No matching start — create complete subagent_call part
          parts.push({
            id: saPartId,
            message_id: message.id,
            type: 'subagent_call',
            content: JSON.stringify({
              op_id,
              name,
              description: '',
              result: result || '',
              duration_ms: duration_ms ?? 0,
              status: status || (success ? 'success' : 'error'),
            }),
            metadata: { timestamp: new Date().toISOString() },
            created_at: new Date().toISOString(),
          });
        }
        return parts;
      });
      return { message: updated, state: newState, effects };
    }

    // ----- interrupt -----
    case 'interrupt': {
      effects.interrupt = {
        action_requests: event.data.action_requests || [],
        review_configs: event.data.review_configs || [],
      };
      return { message, state, effects };
    }

    // ----- error -----
    case 'error': {
      effects.error = event.data.error || 'Unknown error';
      const updated = updateMessageParts(message, (parts) => {
        parts.push({
          id: `${message.id}-err-${Date.now()}`,
          message_id: message.id,
          type: 'error',
          content: JSON.stringify({
            error: event.data.error,
            code: event.data.code,
          }),
          metadata: { timestamp: new Date().toISOString() },
          created_at: new Date().toISOString(),
        });
        return parts;
      });
      return { message: updated, state, effects };
    }

    // ----- done -----
    case 'done': {
      effects.done = true;
      effects.doneStatus = event.data?.status;
      return { message, state, effects };
    }

    default:
      return { message, state, effects };
  }
}

// ---------------------------------------------------------------------------
// Subagent child event helpers
// ---------------------------------------------------------------------------

function updateSubagentStreamingText(message: Message, parentOpId: string, text: string): Message {
  return updateMessageParts(message, (parts) => {
    const saPartId = `${message.id}-sa-${parentOpId}`;
    const idx = findPartById(parts, saPartId);
    if (idx !== -1) {
      try {
        const existing = JSON.parse(parts[idx].content);
        const childEvents = existing.child_events || [];

        // Append to the last text child_event, or create a new one.
        // This keeps text interleaved with tool_call entries.
        const last = childEvents[childEvents.length - 1];
        if (last && last.type === 'text') {
          last.content = (last.content || '') + text;
        } else {
          childEvents.push({ type: 'text', content: text });
        }

        parts[idx] = {
          ...parts[idx],
          content: JSON.stringify({
            ...existing,
            streaming_text: (existing.streaming_text || '') + text,
            child_events: childEvents,
          }),
        };
      } catch { /* ignore */ }
    }
    return parts;
  });
}

function appendSubagentChildEvent(
  message: Message,
  parentOpId: string,
  childEvent: Record<string, unknown>,
): Message {
  return updateMessageParts(message, (parts) => {
    const saPartId = `${message.id}-sa-${parentOpId}`;
    const idx = findPartById(parts, saPartId);
    if (idx !== -1) {
      try {
        const existing = JSON.parse(parts[idx].content);
        const childEvents = existing.child_events || [];
        parts[idx] = {
          ...parts[idx],
          content: JSON.stringify({
            ...existing,
            child_events: [...childEvents, childEvent],
          }),
        };
      } catch { /* ignore */ }
    }
    return parts;
  });
}
