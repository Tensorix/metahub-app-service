"""Agent Chat schemas - Request and response models."""

from __future__ import annotations

from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Chat request model."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="User message content"
    )
    topic_id: Optional[UUID] = Field(
        None,
        description="Topic ID, creates new if not provided"
    )
    stream: bool = Field(
        True,
        description="Whether to stream response"
    )


class ChatResponse(BaseModel):
    """Non-streaming chat response."""

    message: str = Field(..., description="AI response content")
    session_id: UUID = Field(..., description="Session ID")
    topic_id: UUID = Field(..., description="Topic ID")
    message_id: UUID = Field(..., description="AI message ID")
    metrics: Optional["ChatPerformanceMetrics"] = Field(
        None,
        description="Chat performance metrics",
    )


class ChatPerformanceMetrics(BaseModel):
    """Chat performance metrics payload."""

    first_token_latency_ms: Optional[int] = Field(None, description="First token latency in ms")
    completion_duration_ms: Optional[int] = Field(None, description="Duration from first token to completion in ms")
    total_duration_ms: int = Field(..., description="Total request duration in ms")
    input_tokens: Optional[int] = Field(None, description="Input tokens")
    output_tokens: Optional[int] = Field(None, description="Output tokens")
    total_tokens: Optional[int] = Field(None, description="Total tokens")
    output_tokens_per_second: Optional[float] = Field(None, description="Output token throughput")
    input_token_source: Literal["reported", "estimated", "unavailable"] = Field(
        ...,
        description="Source for input token count",
    )
    output_token_source: Literal["reported", "estimated", "unavailable"] = Field(
        ...,
        description="Source for output token count",
    )
    total_token_source: Literal["reported", "estimated", "unavailable"] = Field(
        ...,
        description="Source for total token count",
    )


class StreamEvent(BaseModel):
    """SSE event model."""

    event: Literal["message", "thinking", "operation_start", "operation_end", "metrics", "done", "error", "interrupt"]
    data: dict


class ChatResumeRequest(BaseModel):
    """Resume chat after human-in-the-loop approval."""

    topic_id: UUID = Field(..., description="Topic ID")
    decisions: list[dict] = Field(
        ...,
        description="User decisions: [{type: 'approve'|'edit'|'reject'}, edited_action?: {name, args}}]",
    )


class StopRequest(BaseModel):
    """Stop generation request."""

    reason: Optional[str] = Field(None, description="Stop reason")


class StopResponse(BaseModel):
    """Stop generation response."""

    success: bool
    message: str


# WebSocket message types
class WSIncomingMessage(BaseModel):
    """WebSocket incoming message."""

    type: Literal["message", "stop"]
    content: Optional[str] = None
    topic_id: Optional[UUID] = None


class WSOutgoingMessage(BaseModel):
    """WebSocket outgoing message."""

    type: Literal["chunk", "thinking", "operation_start", "operation_end", "metrics", "done", "error", "stopped"]
    content: Optional[str] = None
    op_id: Optional[str] = None
    op_type: Optional[Literal["tool", "subagent"]] = None
    name: Optional[str] = None
    description: Optional[str] = None
    args: Optional[dict] = None
    result: Optional[str] = None
    success: Optional[bool] = None
    duration_ms: Optional[int] = None
    status: Optional[Literal["success", "error", "cancelled"]] = None
    message: Optional[str] = None
    metrics: Optional[ChatPerformanceMetrics] = None
