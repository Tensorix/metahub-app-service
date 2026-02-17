# app/scheduler/registry.py

"""Handler registry for scheduled tasks.

Register a handler with the ``@register_handler`` decorator::

    from app.scheduler.registry import register_handler

    @register_handler("send_message")
    def handle_send_message(task, db):
        ...

Async handlers are equally supported::

    @register_handler("run_agent")
    async def handle_run_agent(task, db):
        ...
"""

from typing import Callable, Optional

from loguru import logger

_handlers: dict[str, Callable] = {}


def register_handler(task_type: str):
    """Decorator that registers a callable as the handler for *task_type*."""

    def decorator(fn: Callable) -> Callable:
        if task_type in _handlers:
            logger.warning(
                f"Overwriting existing handler for task_type={task_type!r}"
            )
        _handlers[task_type] = fn
        logger.debug(f"Registered scheduled-task handler: {task_type!r}")
        return fn

    return decorator


def get_handler(task_type: str) -> Optional[Callable]:
    """Return the handler for *task_type*, or ``None`` if not registered."""
    return _handlers.get(task_type)


def list_handlers() -> list[str]:
    """Return all registered task-type names."""
    return list(_handlers.keys())
