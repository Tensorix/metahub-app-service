# app/scheduler/core.py

"""Scheduler service wrapping APScheduler's AsyncIOScheduler.

Provides a clean class-level API consumed by the service layer and the
FastAPI lifespan.  The database ``ScheduledTask`` table is the source of
truth; APScheduler is used purely as an in-memory scheduling engine that
is rebuilt on every application start.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger
from pytz import utc
from sqlalchemy.orm import Session

from app.scheduler.dispatcher import dispatch_task


class SchedulerService:
    """Singleton-style wrapper around the APScheduler instance."""

    _scheduler: Optional[AsyncIOScheduler] = None

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    @classmethod
    def init(cls) -> None:
        """Create the APScheduler instance (call once at startup)."""
        if cls._scheduler is not None:
            logger.warning("SchedulerService.init() called more than once")
            return
        cls._scheduler = AsyncIOScheduler(timezone=utc)
        logger.info("SchedulerService initialized")

    @classmethod
    async def start(cls, db: Session) -> None:
        """Load all active tasks from DB and start the scheduler."""
        from app.db.model.scheduled_task import ScheduledTask

        if cls._scheduler is None:
            raise RuntimeError("SchedulerService.init() must be called first")

        tasks = (
            db.query(ScheduledTask)
            .filter(ScheduledTask.status == "active")
            .all()
        )
        loaded = 0
        for task in tasks:
            try:
                cls._add_job(task)
                loaded += 1
            except Exception as e:
                logger.error(f"Failed to load task {task.id}: {e}")

        cls._scheduler.start()
        logger.info(f"Scheduler started with {loaded}/{len(tasks)} active tasks")

    @classmethod
    async def shutdown(cls) -> None:
        """Gracefully shut down the scheduler."""
        if cls._scheduler is not None:
            cls._scheduler.shutdown(wait=False)
            cls._scheduler = None
            logger.info("Scheduler shut down")

    # ------------------------------------------------------------------ #
    # Job management (called by ScheduledTaskService)
    # ------------------------------------------------------------------ #

    @classmethod
    def add_task(cls, task) -> None:
        """Register a task with the scheduler."""
        cls._ensure_running()
        cls._add_job(task)

    @classmethod
    def update_task(cls, task) -> None:
        """Re-register a task after its schedule config changed."""
        cls._ensure_running()
        job_id = str(task.id)
        if cls._scheduler.get_job(job_id):
            cls._scheduler.remove_job(job_id)
        cls._add_job(task)

    @classmethod
    def remove_task(cls, task_id: UUID) -> None:
        """Remove a task from the scheduler."""
        cls._ensure_running()
        job_id = str(task_id)
        if cls._scheduler.get_job(job_id):
            cls._scheduler.remove_job(job_id)
            logger.debug(f"Removed job {job_id} from scheduler")

    @classmethod
    def pause_task(cls, task_id: UUID) -> None:
        """Pause a scheduled job."""
        cls._ensure_running()
        job_id = str(task_id)
        job = cls._scheduler.get_job(job_id)
        if job:
            job.pause()
            logger.debug(f"Paused job {job_id}")

    @classmethod
    def resume_task(cls, task_id: UUID) -> None:
        """Resume a paused job."""
        cls._ensure_running()
        job_id = str(task_id)
        job = cls._scheduler.get_job(job_id)
        if job:
            job.resume()
            logger.debug(f"Resumed job {job_id}")

    @classmethod
    def get_next_run_time(cls, task_id: UUID) -> Optional[datetime]:
        """Return the next scheduled run time for a task, or None."""
        if cls._scheduler is None:
            return None
        job = cls._scheduler.get_job(str(task_id))
        return job.next_run_time if job else None

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    @classmethod
    def _ensure_running(cls) -> None:
        if cls._scheduler is None or not cls._scheduler.running:
            raise RuntimeError("Scheduler is not running")

    @classmethod
    def _add_job(cls, task) -> None:
        """Build a trigger from *task* and add it to APScheduler."""
        trigger = cls._build_trigger(task)
        cls._scheduler.add_job(
            dispatch_task,
            trigger=trigger,
            id=str(task.id),
            args=[task.id],
            replace_existing=True,
            misfire_grace_time=60,
        )
        logger.debug(
            f"Added job {task.id} ({task.schedule_type}: {task.schedule_config})"
        )

    @classmethod
    def _build_trigger(cls, task):
        """Convert a ScheduledTask's schedule_config into an APScheduler trigger."""
        cfg = dict(task.schedule_config)
        tz = task.timezone or "UTC"

        if task.schedule_type == "cron":
            return CronTrigger(timezone=tz, **cfg)

        if task.schedule_type == "interval":
            return IntervalTrigger(timezone=tz, **cfg)

        if task.schedule_type == "one_shot":
            run_at = cfg.get("run_at")
            if isinstance(run_at, str):
                run_at = datetime.fromisoformat(run_at)
            return DateTrigger(run_date=run_at, timezone=tz)

        raise ValueError(f"Unknown schedule_type: {task.schedule_type!r}")
