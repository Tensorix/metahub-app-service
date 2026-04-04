"""Business logic for sandbox lifecycle, scoped to sessions."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.model.session_sandbox import SessionSandbox
from app.sandbox import get_sandbox_client
from app.service.system_config import get_sandbox_config

logger = logging.getLogger(__name__)


class SandboxService:
    """Sandbox lifecycle management."""

    @staticmethod
    async def create_sandbox(
        db: Session,
        session_id: UUID,
        user_id: UUID,
        image: str | None = None,
        timeout: int | None = None,
        env: dict[str, str] | None = None,
    ) -> SessionSandbox:
        config = get_sandbox_config(db)
        if not config.enabled:
            raise HTTPException(400, "Sandbox feature is not enabled")
        if not config.api_domain or not config.api_key:
            raise HTTPException(400, "Sandbox API not configured")

        # Check for existing sandbox
        existing = (
            db.query(SessionSandbox)
            .filter(SessionSandbox.session_id == session_id)
            .first()
        )
        if existing:
            if existing.status not in ("stopped", "error"):
                raise HTTPException(409, "Session already has an active sandbox")
            # Remove stale record so we can create a fresh one (unique constraint)
            db.delete(existing)
            db.flush()

        # Per-user limit
        active_count = (
            db.query(SessionSandbox)
            .filter(
                SessionSandbox.user_id == user_id,
                SessionSandbox.status.in_(["creating", "running", "paused"]),
            )
            .count()
        )
        if active_count >= config.max_per_user:
            raise HTTPException(
                429, f"Sandbox limit reached ({config.max_per_user} per user)"
            )

        effective_image = image or config.default_image
        effective_timeout = timeout or config.default_timeout

        record = SessionSandbox(
            session_id=session_id,
            user_id=user_id,
            status="creating",
            image=effective_image,
            config={"env": env} if env else None,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        try:
            client = get_sandbox_client(config)
            sandbox = await client.create(
                image=effective_image,
                timeout=effective_timeout,
                env=env,
            )
            record.sandbox_id = sandbox.id
            record.status = "running"
            record.expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=effective_timeout
            )
            db.commit()
            db.refresh(record)
        except Exception as e:
            logger.error(f"Failed to create sandbox: {e}", exc_info=True)
            record.status = "error"
            record.error_message = str(e)[:500]
            db.commit()
            db.refresh(record)
            raise HTTPException(502, f"Failed to create sandbox: {e}")

        # Clear agent cache so next chat picks up sandbox tools
        _clear_agent_cache_for_session(db, session_id)

        return record

    @staticmethod
    async def get_sandbox(
        db: Session, session_id: UUID, user_id: UUID
    ) -> Optional[SessionSandbox]:
        return (
            db.query(SessionSandbox)
            .filter(
                SessionSandbox.session_id == session_id,
                SessionSandbox.user_id == user_id,
            )
            .first()
        )

    @staticmethod
    async def stop_sandbox(
        db: Session, session_id: UUID, user_id: UUID
    ) -> SessionSandbox:
        record = (
            db.query(SessionSandbox)
            .filter(
                SessionSandbox.session_id == session_id,
                SessionSandbox.user_id == user_id,
            )
            .first()
        )
        if not record:
            raise HTTPException(404, "No sandbox for this session")

        if record.status == "stopped":
            return record

        if record.sandbox_id:
            try:
                config = get_sandbox_config(db)
                client = get_sandbox_client(config)
                await client.kill(record.sandbox_id)
            except Exception as e:
                logger.warning(f"Failed to kill remote sandbox: {e}")

        record.status = "stopped"
        db.commit()
        db.refresh(record)

        _clear_agent_cache_for_session(db, session_id)

        return record

    @staticmethod
    async def renew_sandbox(
        db: Session, session_id: UUID, user_id: UUID, duration: int
    ) -> SessionSandbox:
        record = (
            db.query(SessionSandbox)
            .filter(
                SessionSandbox.session_id == session_id,
                SessionSandbox.user_id == user_id,
                SessionSandbox.status == "running",
            )
            .first()
        )
        if not record or not record.sandbox_id:
            raise HTTPException(404, "No running sandbox for this session")

        config = get_sandbox_config(db)
        client = get_sandbox_client(config)
        await client.renew(record.sandbox_id, duration)
        record.expires_at = datetime.now(timezone.utc) + timedelta(seconds=duration)
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def get_active_sandbox_id(db: Session, session_id: UUID) -> Optional[str]:
        """Quick lookup: return sandbox_id if session has a running sandbox."""
        record = (
            db.query(SessionSandbox.sandbox_id)
            .filter(
                SessionSandbox.session_id == session_id,
                SessionSandbox.status == "running",
            )
            .first()
        )
        return record[0] if record else None

    @staticmethod
    async def cleanup_on_session_delete(db: Session, session_id: UUID) -> None:
        """Kill sandbox when session is deleted (cascade helper)."""
        record = (
            db.query(SessionSandbox)
            .filter(
                SessionSandbox.session_id == session_id,
                SessionSandbox.status.in_(["creating", "running", "paused"]),
            )
            .first()
        )
        if not record:
            return

        if record.sandbox_id:
            try:
                config = get_sandbox_config(db)
                client = get_sandbox_client(config)
                await client.kill(record.sandbox_id)
            except Exception as e:
                logger.warning(f"Cleanup: failed to kill sandbox: {e}")

        record.status = "stopped"
        db.commit()


def _clear_agent_cache_for_session(db: Session, session_id: UUID) -> None:
    """Clear agent cache so next chat picks up tool changes."""
    from app.db.model import Session as SessionModel
    from app.agent.factory import AgentFactory

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if session and session.agent_id:
        AgentFactory.clear_cache(session.agent_id)
