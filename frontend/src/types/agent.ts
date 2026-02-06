/**
 * Agent Chat API types
 */

// SSE Event types
export type ChatEventType =
  | 'message'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'done'
  | 'error';

export interface ChatEventMessage {
  event: 'message';
  data: {
    content: string;
  };
}

export interface ChatEventThinking {
  event: 'thinking';
  data: {
    content: string;
  };
}

export interface ChatEventToolCall {
  event: 'tool_call';
  data: {
    call_id: string;
    name: string;
    args: Record<string, unknown>;
  };
}

export interface ChatEventToolResult {
  event: 'tool_result';
  data: {
    call_id: string;
    name: string;
    result: string;
    success?: boolean;
  };
}

export interface ChatEventDone {
  event: 'done';
  data: {
    status: 'complete' | 'cancelled';
  };
}

export interface ChatEventError {
  event: 'error';
  data: {
    error: string;
    code?: string;
  };
}

export type ChatEvent =
  | ChatEventMessage
  | ChatEventThinking
  | ChatEventToolCall
  | ChatEventToolResult
  | ChatEventDone
  | ChatEventError;

// Request/Response types
export interface ChatRequest {
  message: string;
  topic_id?: string;
  stream?: boolean;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  topic_id: string;
  message_id: string;
}

// WebSocket message types
export interface WSOutgoingMessage {
  type: 'message' | 'stop';
  content?: string;
  topic_id?: string;
}

export interface WSIncomingChunk {
  type: 'chunk';
  content: string;
}

export interface WSIncomingThinking {
  type: 'thinking';
  content: string;
}

export interface WSIncomingToolCall {
  type: 'tool_call';
  call_id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface WSIncomingToolResult {
  type: 'tool_result';
  call_id: string;
  name: string;
  result: string;
}

export interface WSIncomingDone {
  type: 'done';
}

export interface WSIncomingError {
  type: 'error';
  message: string;
}

export interface WSIncomingStopped {
  type: 'stopped';
}

export type WSIncomingMessage =
  | WSIncomingChunk
  | WSIncomingThinking
  | WSIncomingToolCall
  | WSIncomingToolResult
  | WSIncomingDone
  | WSIncomingError
  | WSIncomingStopped;
