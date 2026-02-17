# app/scheduler/__init__.py

"""Scheduled task engine.

Public API::

    from app.scheduler import SchedulerService, register_handler

    # In FastAPI lifespan
    SchedulerService.init()
    await SchedulerService.start(db)
    ...
    await SchedulerService.shutdown()

    # Register a handler
    @register_handler("my_task")
    def handle_my_task(task, db):
        ...
"""

from app.scheduler.core import SchedulerService
from app.scheduler.registry import register_handler, get_handler, list_handlers

# Import built-in task handlers so they self-register on module load
import app.scheduler.tasks  # noqa: F401

__all__ = [
    "SchedulerService",
    "register_handler",
    "get_handler",
    "list_handlers",
]
