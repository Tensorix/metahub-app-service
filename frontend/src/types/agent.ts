/**
 * Agent Chat API types
 */

// SSE Event types
export type ChatEventType =
  | 'message'
  | 'thinking'
  | 'operation_start'
  | 'operation_end'
  | 'done'
  | 'error'
  | 'interrupt';

export interface ChatEventInterrupt {
  event: 'interrupt';
  data: {
    action_requests: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
    review_configs: Array<{ action_name: string; allowed_decisions?: string[] }>;
  };
}

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

export interface ChatEventOperationStart {
  event: 'operation_start';
  data: {
    op_id: string;
    op_type: 'tool' | 'subagent';
    name: string;
    args?: Record<string, unknown>;
    description?: string;
    started_at: string;
  };
}

export interface ChatEventOperationEnd {
  event: 'operation_end';
  data: {
    op_id: string;
    op_type: 'tool' | 'subagent';
    name: string;
    result: string;
    success: boolean;
    duration_ms: number;
    status: 'success' | 'error' | 'cancelled';
    ended_at: string;
  };
}

export interface ChatEventDone {
  event: 'done';
  data: {
    status: 'complete' | 'cancelled' | 'interrupt';
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
  | ChatEventOperationStart
  | ChatEventOperationEnd
  | ChatEventDone
  | ChatEventError
  | ChatEventInterrupt;

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

export interface WSIncomingOperationStart {
  type: 'operation_start';
  op_id: string;
  op_type: 'tool' | 'subagent';
  name: string;
  args?: Record<string, unknown>;
  description?: string;
  started_at: string;
}

export interface WSIncomingOperationEnd {
  type: 'operation_end';
  op_id: string;
  op_type: 'tool' | 'subagent';
  name: string;
  result: string;
  success: boolean;
  duration_ms: number;
  status: 'success' | 'error' | 'cancelled';
  ended_at: string;
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
  | WSIncomingOperationStart
  | WSIncomingOperationEnd
  | WSIncomingDone
  | WSIncomingError
  | WSIncomingStopped;
