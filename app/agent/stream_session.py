"""
SSE Stream Session with reconnection support.

Decouples agent execution from SSE connections: the agent runs in an
independent asyncio.Task, events are cached in a ring buffer, and SSE
connections become lightweight subscribers that can reconnect and replay
missed events.
"""

import asyncio
import json
import logging
import time
from collections import deque
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncIterator, Callable, Coroutine, Optional
from uuid import UUID

from app.config import config

logger = logging.getLogger(__name__)


class StreamStatus(str, Enum):
    PENDING = "pending"
    STREAMING = "streaming"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


class StreamSession:
    """A single streaming session that runs an agent in a background task.

    Subscribers (SSE connections) attach/detach independently; the agent
    keeps running regardless of subscriber count.
    """

    def __init__(self, key: str, buffer_size: int | None = None):
        self.key = key
        self.status: StreamStatus = StreamStatus.PENDING
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.message_id: Optional[UUID] = None

        self._event_counter: int = 0
        self._buffer: deque[dict] = deque(maxlen=buffer_size or config.STREAM_BUFFER_SIZE)
        self._subscribers: dict[int, asyncio.Queue] = {}
        self._subscriber_id_seq: int = 0
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Event production (called from the agent runner coroutine)
    # ------------------------------------------------------------------

    def _emit(self, event: dict) -> None:
        """Assign an event_id, buffer the event, and broadcast to subscribers."""
        self._event_counter += 1
        event["id"] = str(self._event_counter)
        self._buffer.append(event)
        for q in self._subscribers.values():
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "Subscriber queue full for session %s, dropping event %s",
                    self.key,
                    event["id"],
                )

    # ------------------------------------------------------------------
    # Subscriber management
    # ------------------------------------------------------------------

    async def subscribe(
        self,
        last_event_id: int = 0,
    ) -> AsyncIterator[dict]:
        """Yield events starting after *last_event_id*.

        Replays buffered events first, then streams live events until the
        session completes or the caller cancels.
        """
        async with self._lock:
            self._subscriber_id_seq += 1
            sub_id = self._subscriber_id_seq
            q: asyncio.Queue = asyncio.Queue(maxsize=2000)
            self._subscribers[sub_id] = q

        try:
            # 1. Replay buffered events that the subscriber missed
            for ev in list(self._buffer):
                ev_id = int(ev.get("id", 0))
                if ev_id > last_event_id:
                    yield ev

            # 2. Stream live events
            while True:
                # If the session is done and the queue is empty, stop
                if self.status in (
                    StreamStatus.COMPLETED,
                    StreamStatus.ERROR,
                    StreamStatus.CANCELLED,
                ) and q.empty():
                    break

                try:
                    event = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield event
                except asyncio.TimeoutError:
                    continue
        finally:
            async with self._lock:
                self._subscribers.pop(sub_id, None)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(
        self,
        coro_factory: Callable[["StreamSession"], Coroutine[Any, Any, None]],
    ) -> None:
        """Launch the agent runner as an independent Task."""
        self.status = StreamStatus.STREAMING
        self.started_at = datetime.now(timezone.utc)
        self._task = asyncio.create_task(self._run_wrapper(coro_factory))

    async def _run_wrapper(
        self,
        coro_factory: Callable[["StreamSession"], Coroutine[Any, Any, None]],
    ) -> None:
        try:
            await coro_factory(self)
            if self.status == StreamStatus.STREAMING:
                self.status = StreamStatus.COMPLETED
        except asyncio.CancelledError:
            self.status = StreamStatus.CANCELLED
            raise
        except Exception:
            logger.exception("StreamSession %s runner failed", self.key)
            self.status = StreamStatus.ERROR
        finally:
            self.completed_at = datetime.now(timezone.utc)

    def cancel(self) -> bool:
        """Cancel the running task. Returns True if actually cancelled."""
        if self._task and not self._task.done():
            self._task.cancel()
            return True
        return False

    @property
    def is_alive(self) -> bool:
        return self._task is not None and not self._task.done()

    @property
    def last_event_id(self) -> int:
        return self._event_counter


class StreamSessionManager:
    """Manages active StreamSessions with TTL-based cleanup."""

    def __init__(self) -> None:
        self._sessions: dict[str, StreamSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def start_cleanup_loop(self) -> None:
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self) -> None:
        ttl = config.STREAM_SESSION_TTL
        while True:
            await asyncio.sleep(30)
            now = datetime.now(timezone.utc)
            expired = []
            for key, session in self._sessions.items():
                if session.completed_at is not None:
                    age = (now - session.completed_at).total_seconds()
                    if age > ttl:
                        expired.append(key)
            for key in expired:
                logger.info("Cleaning up expired stream session %s", key)
                self._sessions.pop(key, None)

    def create(self, key: str) -> StreamSession:
        """Create and register a new StreamSession, evicting any stale one."""
        old = self._sessions.get(key)
        if old and old.is_alive:
            old.cancel()
        session = StreamSession(key)
        self._sessions[key] = session
        return session

    def get(self, key: str) -> Optional[StreamSession]:
        return self._sessions.get(key)

    async def shutdown(self) -> None:
        """Cancel all active sessions (called at app shutdown)."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
        for session in self._sessions.values():
            session.cancel()
        self._sessions.clear()


# Module-level singleton
stream_session_manager = StreamSessionManager()
