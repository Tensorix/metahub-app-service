/**
 * Agent Chat API types
 */

// SSE Event types
export type ChatEventType =
  | 'message'
  | 'thinking'
  | 'operation_start'
  | 'operation_end'
  | 'metrics'
  | 'done'
  | 'error'
  | 'interrupt'
  | 'stream_expired';

export interface ChatPerformanceMetrics {
  first_token_latency_ms: number | null;
  completion_duration_ms: number | null;
  total_duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  output_tokens_per_second: number | null;
  input_token_source: 'reported' | 'estimated' | 'unavailable';
  output_token_source: 'reported' | 'estimated' | 'unavailable';
  total_token_source: 'reported' | 'estimated' | 'unavailable';
}

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
    parent_op_id?: string;
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
    parent_op_id?: string;
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
    parent_op_id?: string;
  };
}

export interface ChatEventMetrics {
  event: 'metrics';
  data: ChatPerformanceMetrics;
}

export interface ChatEventDone {
  event: 'done';
  data: {
    status: 'complete' | 'cancelled' | 'interrupt';
    message_id?: string;
  };
}

export interface ChatEventStreamExpired {
  event: 'stream_expired';
  data: {
    reason: string;
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
  | ChatEventMetrics
  | ChatEventDone
  | ChatEventError
  | ChatEventInterrupt
  | ChatEventStreamExpired;

// Stream reconnection
export interface StreamStatusResponse {
  status: 'streaming' | 'completed' | 'error' | 'cancelled' | 'none';
  last_event_id: number;
  message_id?: string;
  started_at?: string;
  completed_at?: string;
}

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
  metrics?: ChatPerformanceMetrics;
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
  status?: 'complete' | 'cancelled' | 'interrupt';
}

export interface WSIncomingMetrics {
  type: 'metrics';
  metrics: ChatPerformanceMetrics;
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
  | WSIncomingMetrics
  | WSIncomingDone
  | WSIncomingError
  | WSIncomingStopped;
