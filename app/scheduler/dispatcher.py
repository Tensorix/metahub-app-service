# app/scheduler/dispatcher.py

"""Task dispatcher invoked by APScheduler on each trigger.

Responsibilities:
  1. Load the ``ScheduledTask`` row from the database.
  2. Resolve the handler via the registry.
  3. Execute the handler (sync or async).
  4. Update execution tracking fields (run_count, last_run_*, status).
"""

import asyncio
from datetime import datetime
from uuid import UUID

from loguru import logger

from app.db.session import SessionLocal
from app.scheduler.registry import get_handler


async def dispatch_task(task_id: UUID) -> None:
    """Entry-point called by APScheduler for every scheduled trigger."""
    from app.db.model.scheduled_task import ScheduledTask

    with SessionLocal() as db:
        task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()

        if task is None:
            logger.warning(f"Scheduled task {task_id} not found in DB, skipping")
            return

        if task.status != "active":
            logger.info(
                f"Scheduled task {task_id} status={task.status}, skipping execution"
            )
            return

        handler = get_handler(task.task_type)
        if handler is None:
            logger.error(
                f"No handler registered for task_type={task.task_type!r} "
                f"(task_id={task_id})"
            )
            task.last_run_at = datetime.utcnow()
            task.last_run_status = "failed"
            task.last_run_error = f"No handler for task_type={task.task_type!r}"
            task.run_count += 1
            db.commit()
            return

        logger.info(f"Dispatching task {task_id} name={task.name!r} type={task.task_type}")

        try:
            if asyncio.iscoroutinefunction(handler):
                await handler(task, db)
            else:
                handler(task, db)

            task.last_run_at = datetime.utcnow()
            task.last_run_status = "success"
            task.last_run_error = None
            task.run_count += 1
            logger.info(f"Task {task_id} executed successfully (run #{task.run_count})")

        except Exception as e:
            logger.exception(f"Task {task_id} execution failed: {e}")
            task.last_run_at = datetime.utcnow()
            task.last_run_status = "failed"
            task.last_run_error = str(e)
            task.run_count += 1

        # Auto-complete when max_runs is reached
        if task.max_runs is not None and task.run_count >= task.max_runs:
            task.status = "completed"
            logger.info(
                f"Task {task_id} reached max_runs={task.max_runs}, marked completed"
            )

        db.commit()
