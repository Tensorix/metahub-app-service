"""
Agent Chat schemas - Request and response models.
"""

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


class StreamEvent(BaseModel):
    """SSE event model."""

    event: Literal["message", "tool_call", "tool_result", "done", "error"]
    data: dict


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

    type: Literal["chunk", "tool_call", "tool_result", "done", "error", "stopped"]
    content: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict] = None
    result: Optional[str] = None
    message: Optional[str] = None
