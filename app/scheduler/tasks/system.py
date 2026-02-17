# app/scheduler/tasks/system.py

"""System-level scheduled task handlers.

These are built-in handlers for common maintenance tasks.  They are
registered on import via ``@register_handler``.
"""

from datetime import datetime, timedelta

from loguru import logger
from sqlalchemy.orm import Session

from app.scheduler.registry import register_handler


@register_handler("system_cleanup")
def handle_system_cleanup(task, db: Session) -> None:
    """Clean up stale data: expired tokens, old completed background tasks, etc."""
    from app.db.model.user import UserToken
    from app.db.model.background_task import BackgroundTask

    now = datetime.utcnow()

    # 1. Remove expired user tokens
    expired_tokens = (
        db.query(UserToken)
        .filter(UserToken.expires_at < now)
        .delete(synchronize_session=False)
    )
    logger.info(f"[system_cleanup] Deleted {expired_tokens} expired tokens")

    # 2. Remove old completed/failed background tasks (older than 30 days)
    cutoff = now - timedelta(days=30)
    old_tasks = (
        db.query(BackgroundTask)
        .filter(
            BackgroundTask.status.in_(["completed", "failed", "cancelled"]),
            BackgroundTask.completed_at < cutoff,
        )
        .delete(synchronize_session=False)
    )
    logger.info(f"[system_cleanup] Deleted {old_tasks} old background tasks")

    # 3. Mark expired one-shot scheduled tasks
    from app.db.model.scheduled_task import ScheduledTask

    expired_oneshots = (
        db.query(ScheduledTask)
        .filter(
            ScheduledTask.schedule_type == "one_shot",
            ScheduledTask.status == "active",
            ScheduledTask.run_count > 0,
        )
        .update({"status": "completed"}, synchronize_session=False)
    )
    logger.info(f"[system_cleanup] Completed {expired_oneshots} finished one-shot tasks")

    db.commit()


@register_handler("health_check")
def handle_health_check(task, db: Session) -> None:
    """Simple health-check task that logs a heartbeat."""
    logger.info("[health_check] Scheduler heartbeat OK")
