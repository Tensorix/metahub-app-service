# app/service/scheduled_task.py

"""Service layer for scheduled tasks – CRUD plus scheduler synchronisation."""

from typing import Optional
from uuid import UUID

from loguru import logger
from sqlalchemy.orm import Session

from app.db.model.scheduled_task import ScheduledTask
from app.db.model.session import Session as SessionModel
from app.scheduler.core import SchedulerService
from app.schema.scheduled_task import (
    ScheduledTaskCreate,
    ScheduledTaskUpdate,
    SendMessageTaskParams,
)


class ScheduledTaskService:
    """Static-method service following the project's existing pattern."""

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #

    @staticmethod
    def get_task(db: Session, task_id: UUID, user_id: Optional[UUID] = None) -> Optional[ScheduledTask]:
        """Get a task by id, optionally scoped to a user."""
        query = db.query(ScheduledTask).filter(ScheduledTask.id == task_id)
        if user_id is not None:
            query = query.filter(ScheduledTask.user_id == user_id)
        return query.first()

    @staticmethod
    def list_tasks(
        db: Session,
        user_id: UUID,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ScheduledTask], int]:
        """Return a paginated list of tasks belonging to *user_id*."""
        query = db.query(ScheduledTask).filter(ScheduledTask.user_id == user_id)
        if status:
            query = query.filter(ScheduledTask.status == status)
        if task_type:
            query = query.filter(ScheduledTask.task_type == task_type)

        total = query.count()
        tasks = (
            query
            .order_by(ScheduledTask.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return tasks, total

    # ------------------------------------------------------------------ #
    # Mutations
    # ------------------------------------------------------------------ #

    @staticmethod
    def create_task(
        db: Session,
        user_id: UUID,
        data: ScheduledTaskCreate,
    ) -> ScheduledTask:
        """Create a scheduled task and register it with the scheduler."""
        if data.task_type == "send_message":
            try:
                params = SendMessageTaskParams(**data.task_params)
                # Fail-fast: verify session exists and belongs to user
                session = db.query(SessionModel).filter(
                    SessionModel.id == params.session_id,
                    SessionModel.user_id == user_id,
                    SessionModel.is_deleted == False,
                ).first()
                if not session:
                    raise ValueError(
                        f"Session {params.session_id} not found or does not belong to user"
                    )
            except ValueError as e:
                raise e
            except Exception as e:
                raise ValueError(f"Invalid send_message task_params: {e}") from e

        task = ScheduledTask(
            user_id=user_id,
            name=data.name,
            description=data.description,
            schedule_type=data.schedule_type,
            schedule_config=data.schedule_config,
            timezone=data.timezone,
            task_type=data.task_type,
            task_params=data.task_params,
            max_runs=data.max_runs,
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        # Sync to APScheduler
        try:
            SchedulerService.add_task(task)
            # Persist the computed next_run_at
            next_run = SchedulerService.get_next_run_time(task.id)
            if next_run:
                task.next_run_at = next_run
                db.commit()
        except Exception as e:
            logger.error(f"Failed to register task {task.id} with scheduler: {e}")

        logger.info(f"Created scheduled task {task.id} name={task.name!r}")
        return task

    @staticmethod
    def update_task(
        db: Session,
        task_id: UUID,
        user_id: UUID,
        data: ScheduledTaskUpdate,
    ) -> Optional[ScheduledTask]:
        """Update a scheduled task and re-sync with the scheduler."""
        task = (
            db.query(ScheduledTask)
            .filter(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id)
            .first()
        )
        if task is None:
            return None

        update_fields = data.model_dump(exclude_unset=True)
        schedule_changed = any(
            k in update_fields for k in ("schedule_type", "schedule_config", "timezone")
        )

        for key, value in update_fields.items():
            setattr(task, key, value)

        db.commit()
        db.refresh(task)

        # Re-register with scheduler if schedule configuration changed
        if schedule_changed and task.status == "active":
            try:
                SchedulerService.update_task(task)
                next_run = SchedulerService.get_next_run_time(task.id)
                if next_run:
                    task.next_run_at = next_run
                    db.commit()
            except Exception as e:
                logger.error(f"Failed to update task {task.id} in scheduler: {e}")

        logger.info(f"Updated scheduled task {task.id}")
        return task

    @staticmethod
    def delete_task(
        db: Session,
        task_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Delete a task from both DB and scheduler."""
        task = (
            db.query(ScheduledTask)
            .filter(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id)
            .first()
        )
        if task is None:
            return False

        # Remove from scheduler first
        try:
            SchedulerService.remove_task(task_id)
        except Exception as e:
            logger.warning(f"Failed to remove task {task_id} from scheduler: {e}")

        db.delete(task)
        db.commit()
        logger.info(f"Deleted scheduled task {task_id}")
        return True

    @staticmethod
    def pause_task(
        db: Session,
        task_id: UUID,
        user_id: UUID,
    ) -> Optional[ScheduledTask]:
        """Pause an active task."""
        task = (
            db.query(ScheduledTask)
            .filter(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id)
            .first()
        )
        if task is None:
            return None
        if task.status != "active":
            return task

        task.status = "paused"
        db.commit()

        try:
            SchedulerService.pause_task(task_id)
        except Exception as e:
            logger.warning(f"Failed to pause task {task_id} in scheduler: {e}")

        logger.info(f"Paused scheduled task {task_id}")
        return task

    @staticmethod
    def resume_task(
        db: Session,
        task_id: UUID,
        user_id: UUID,
    ) -> Optional[ScheduledTask]:
        """Resume a paused task."""
        task = (
            db.query(ScheduledTask)
            .filter(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id)
            .first()
        )
        if task is None:
            return None
        if task.status != "paused":
            return task

        task.status = "active"
        db.commit()

        try:
            SchedulerService.resume_task(task_id)
            next_run = SchedulerService.get_next_run_time(task.id)
            if next_run:
                task.next_run_at = next_run
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to resume task {task_id} in scheduler: {e}")

        logger.info(f"Resumed scheduled task {task_id}")
        return task

    @staticmethod
    async def trigger_task(
        db: Session,
        task_id: UUID,
        user_id: UUID,
    ) -> Optional[ScheduledTask]:
        """Trigger a one-off execution of the task immediately."""
        from app.scheduler.dispatcher import dispatch_task

        task = (
            db.query(ScheduledTask)
            .filter(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id)
            .first()
        )
        if task is None:
            return None

        logger.info(f"Manually triggering scheduled task {task_id}")
        await dispatch_task(task_id)

        db.refresh(task)
        return task
