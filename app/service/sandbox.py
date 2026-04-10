"""Business logic for sandbox lifecycle, scoped to sessions."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.model.session_sandbox import SessionSandbox
from app.sandbox import get_sandbox_client
from app.sandbox.client import SandboxPtySessionNotFoundError
from app.schema.sandbox import SandboxHostMount
from app.service.system_config import get_sandbox_config

logger = logging.getLogger(__name__)

_UNSET = object()


class SandboxService:
    """Sandbox lifecycle management."""

    @staticmethod
    async def upsert_sandbox_config(
        db: Session,
        session_id: UUID,
        user_id: UUID,
        image: str | None = None,
        timeout: int | None = None,
        timeout_provided: bool = False,
        mounts: list[SandboxHostMount] | None = None,
        replace_mounts: bool = False,
    ) -> SessionSandbox:
        """Persist per-session sandbox config without starting a sandbox.

        Creates a stopped placeholder record if none exists. Rejects edits
        while a sandbox is active (creating/running/stopping).
        """
        existing = (
            db.query(SessionSandbox)
            .filter(SessionSandbox.session_id == session_id)
            .first()
        )

        if existing:
            if existing.status in ("creating", "running", "paused", "stopping"):
                raise HTTPException(
                    400, "Cannot modify sandbox config while it is running"
                )
            if image is not None:
                existing.image = image
            if timeout_provided:
                existing.timeout = timeout
            existing.config = _merge_sandbox_config(
                existing.config,
                mounts=mounts if replace_mounts else _UNSET,
            )
            db.commit()
            db.refresh(existing)
            return existing

        # Create placeholder stopped record so config is persisted
        config = get_sandbox_config(db)
        record = SessionSandbox(
            session_id=session_id,
            user_id=user_id,
            status="stopped",
            image=image or config.default_image,
            timeout=timeout if timeout_provided else None,
            config=_merge_sandbox_config(
                None,
                mounts=mounts if replace_mounts else _UNSET,
            ),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    async def create_sandbox(
        db: Session,
        session_id: UUID,
        user_id: UUID,
        image: str | None = None,
        timeout: int | None = None,
        timeout_provided: bool = False,
        env: dict[str, str] | None = None,
        mounts: list[SandboxHostMount] | None = None,
    ) -> SessionSandbox:
        config = get_sandbox_config(db)
        if not config.enabled:
            raise HTTPException(400, "Sandbox feature is not enabled")
        if not config.api_domain or not config.api_key:
            raise HTTPException(400, "Sandbox API not configured")

        # Check for existing sandbox; preserve any persisted config
        existing = (
            db.query(SessionSandbox)
            .filter(SessionSandbox.session_id == session_id)
            .first()
        )
        persisted_image: str | None = None
        persisted_timeout: int | None = None
        persisted_timeout_provided: bool = False
        persisted_config: dict[str, Any] | None = None
        if existing:
            if existing.status not in ("stopped", "error"):
                raise HTTPException(409, "Session already has an active sandbox")
            persisted_image = existing.image
            persisted_timeout = existing.timeout
            # If an existing record has a non-default timeout (either a custom
            # value or explicit never-expires), we treat that as the persisted
            # preference. Stock fresh records created with defaults have
            # timeout=None which means "fall back to global default".
            persisted_timeout_provided = existing.timeout is not None
            persisted_config = _clone_config(existing.config)
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

        # Priority: explicit body → persisted record → global default
        effective_image = image or persisted_image or config.default_image
        if timeout_provided:
            effective_timeout = timeout  # may be None → never expires
        elif persisted_timeout_provided:
            effective_timeout = persisted_timeout  # may be None → never expires
        else:
            effective_timeout = config.default_timeout
        effective_env = _resolve_config_value(persisted_config, "env", env)
        effective_mounts = _resolve_config_value(persisted_config, "mounts", mounts)
        merged_config = _merge_sandbox_config(
            persisted_config,
            env=effective_env,
            mounts=effective_mounts,
        )

        record = SessionSandbox(
            session_id=session_id,
            user_id=user_id,
            status="creating",
            image=effective_image,
            timeout=effective_timeout,
            config=merged_config,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        try:
            client = get_sandbox_client(config)
            sandbox = await client.create(
                image=effective_image,
                timeout=effective_timeout,
                env=effective_env,
                mounts=_normalize_mounts(effective_mounts),
            )
            record.sandbox_id = sandbox.id
            record.status = "running"
            record.expires_at = (
                None
                if effective_timeout is None
                else datetime.now(timezone.utc)
                + timedelta(seconds=effective_timeout)
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

        config = get_sandbox_config(db)
        client = get_sandbox_client(config)

        if record.sandbox_id and record.terminal_session_id:
            try:
                await client.delete_pty_session(
                    record.sandbox_id,
                    record.terminal_session_id,
                )
            except SandboxPtySessionNotFoundError:
                pass
            except Exception as e:
                logger.warning(f"Failed to delete remote PTY session: {e}")

        if record.sandbox_id:
            try:
                await client.kill(record.sandbox_id)
            except Exception as e:
                logger.warning(f"Failed to kill remote sandbox: {e}")

        record.sandbox_id = None
        record.status = "stopped"
        record.expires_at = None
        record.terminal_session_id = None
        record.terminal_session_created_at = None
        record.terminal_session_last_seen_at = None
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

        if record.timeout is None:
            raise HTTPException(400, "Non-expiring sandboxes do not need renewal")

        config = get_sandbox_config(db)
        client = get_sandbox_client(config)
        await client.renew(record.sandbox_id, duration)
        record.expires_at = datetime.now(timezone.utc) + timedelta(seconds=duration)
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    async def pause_sandbox(
        db: Session, session_id: UUID, user_id: UUID
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

        if record.terminal_session_id:
            try:
                await client.delete_pty_session(
                    record.sandbox_id,
                    record.terminal_session_id,
                )
            except SandboxPtySessionNotFoundError:
                pass
            except Exception as e:
                logger.warning(f"Failed to delete remote PTY session: {e}")

        await client.pause(record.sandbox_id)
        record.status = "paused"
        record.terminal_session_id = None
        record.terminal_session_created_at = None
        record.terminal_session_last_seen_at = None
        db.commit()
        db.refresh(record)
        _clear_agent_cache_for_session(db, session_id)
        return record

    @staticmethod
    async def resume_sandbox(
        db: Session, session_id: UUID, user_id: UUID
    ) -> SessionSandbox:
        record = (
            db.query(SessionSandbox)
            .filter(
                SessionSandbox.session_id == session_id,
                SessionSandbox.user_id == user_id,
                SessionSandbox.status == "paused",
            )
            .first()
        )
        if not record or not record.sandbox_id:
            raise HTTPException(404, "No paused sandbox for this session")

        config = get_sandbox_config(db)
        client = get_sandbox_client(config)
        await client.resume(record.sandbox_id)
        record.status = "running"
        if record.timeout is None:
            record.expires_at = None
        else:
            record.expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=record.timeout
            )
        db.commit()
        db.refresh(record)
        _clear_agent_cache_for_session(db, session_id)
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

        config = get_sandbox_config(db)
        client = get_sandbox_client(config)

        if record.sandbox_id and record.terminal_session_id:
            try:
                await client.delete_pty_session(
                    record.sandbox_id,
                    record.terminal_session_id,
                )
            except SandboxPtySessionNotFoundError:
                pass
            except Exception as e:
                logger.warning(f"Cleanup: failed to delete PTY session: {e}")

        if record.sandbox_id:
            try:
                await client.kill(record.sandbox_id)
            except Exception as e:
                logger.warning(f"Cleanup: failed to kill sandbox: {e}")

        record.status = "stopped"
        record.terminal_session_id = None
        record.terminal_session_created_at = None
        record.terminal_session_last_seen_at = None
        db.commit()


def _clear_agent_cache_for_session(db: Session, session_id: UUID) -> None:
    """Clear agent cache so next chat picks up tool changes."""
    from app.db.model import Session as SessionModel
    from app.agent.factory import AgentFactory

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if session and session.agent_id:
        AgentFactory.clear_cache(session.agent_id)


def _clone_config(config: dict[str, Any] | None) -> dict[str, Any]:
    return dict(config) if isinstance(config, dict) else {}


def _normalize_mounts(
    mounts: list[SandboxHostMount] | list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if not mounts:
        return []

    normalized: list[dict[str, Any]] = []
    for mount in mounts:
        if isinstance(mount, SandboxHostMount):
            normalized.append(mount.model_dump(exclude_none=True))
        elif isinstance(mount, dict):
            normalized.append(
                SandboxHostMount(**mount).model_dump(exclude_none=True)
            )
    return normalized


def _resolve_config_value(
    config: dict[str, Any] | None,
    key: str,
    explicit: Any,
) -> Any:
    if explicit is not None:
        return explicit
    if isinstance(config, dict):
        return config.get(key)
    return None


def _merge_sandbox_config(
    existing: dict[str, Any] | None,
    *,
    env: dict[str, str] | None | object = _UNSET,
    mounts: list[SandboxHostMount] | list[dict[str, Any]] | None | object = _UNSET,
) -> dict[str, Any] | None:
    result = _clone_config(existing)

    if env is not _UNSET:
        if env:
            result["env"] = env
        else:
            result.pop("env", None)

    if mounts is not _UNSET:
        normalized_mounts = _normalize_mounts(mounts)
        if normalized_mounts:
            result["mounts"] = normalized_mounts
        else:
            result.pop("mounts", None)

    return result or None
