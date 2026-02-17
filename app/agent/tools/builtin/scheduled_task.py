# app/agent/tools/builtin/scheduled_task.py

"""
Scheduled Task Tools - Full CRUD for scheduled tasks.

Generic create, read, update, delete, list, pause, resume, and trigger.
Supports any task_type (send_message, run_agent, call_tool, etc.).
"""

import json
from typing import Optional
from uuid import UUID

from app.agent.tools.context import agent_user_id
from app.agent.tools.registry import ToolRegistry
from app.db.session import SessionLocal
from app.schema.scheduled_task import ScheduledTaskCreate, ScheduledTaskUpdate
from app.service.scheduled_task import ScheduledTaskService


def _get_user_id() -> Optional[UUID]:
    return agent_user_id.get()


def _task_to_str(task) -> str:
    """Format a task for human-readable output."""
    lines = [
        f"id: {task.id}",
        f"name: {task.name}",
        f"task_type: {task.task_type}",
        f"status: {task.status}",
        f"schedule_type: {task.schedule_type}",
        f"schedule_config: {task.schedule_config}",
        f"task_params: {task.task_params}",
        f"timezone: {task.timezone}",
        f"next_run_at: {task.next_run_at}",
        f"run_count: {task.run_count}",
        f"last_run_at: {task.last_run_at}",
        f"last_run_status: {task.last_run_status}",
    ]
    if task.description:
        lines.insert(2, f"description: {task.description}")
    return "\n".join(lines)


@ToolRegistry.register(
    name="create_scheduled_task",
    description=(
        "Create a scheduled task. Generic for any task_type (send_message, run_agent, call_tool, etc.). "
        "schedule_config: JSON, e.g. one_shot {\"run_at\": \"2026-02-18T09:00:00\"}, "
        "cron {\"hour\": 9, \"minute\": 0}, interval {\"minutes\": 30}. "
        "task_params: JSON object for the task handler, e.g. send_message {\"session_id\": \"...\", \"content\": \"...\"}."
    ),
    category="scheduled_task",
)
def create_scheduled_task(
    name: str,
    schedule_type: str,
    schedule_config: str,
    task_type: str,
    task_params: str = "{}",
    description: Optional[str] = None,
    timezone: str = "Asia/Shanghai",
    max_runs: Optional[int] = None,
) -> str:
    """
    Create a scheduled task.

    Args:
        name: Task name (required).
        schedule_type: "one_shot" | "cron" | "interval".
        schedule_config: JSON string. one_shot: {"run_at": "ISO datetime"}, cron: {"hour": 0-23, "minute": 0-59}, interval: {"minutes"/"hours"/"days": N}.
        task_type: e.g. "send_message", "run_agent", "call_tool".
        task_params: JSON string, params for the task handler.
        description: Optional description.
        timezone: e.g. "Asia/Shanghai", "UTC".
        max_runs: Optional max executions; omit for unlimited.

    Returns:
        Success message with task details or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    name = (name or "").strip()
    if not name:
        return "Error: name is required and cannot be empty."

    if schedule_type not in ("one_shot", "cron", "interval"):
        return f"Error: schedule_type must be one_shot, cron, or interval, got {schedule_type}"

    try:
        cfg = json.loads(schedule_config) if isinstance(schedule_config, str) else schedule_config
        if not isinstance(cfg, dict):
            raise ValueError("schedule_config must be a JSON object")
    except json.JSONDecodeError as e:
        return f"Error: Invalid schedule_config JSON: {e}"

    try:
        params = json.loads(task_params) if isinstance(task_params, str) else task_params
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise ValueError("task_params must be a JSON object")
    except json.JSONDecodeError as e:
        return f"Error: Invalid task_params JSON: {e}"

    try:
        data = ScheduledTaskCreate(
            name=name[:100],
            description=(description or "").strip() or None,
            schedule_type=schedule_type,
            schedule_config=cfg,
            timezone=timezone,
            task_type=task_type.strip(),
            task_params=params,
            max_runs=max_runs,
        )
    except Exception as e:
        return f"Error: {e}"

    try:
        with SessionLocal() as db:
            task = ScheduledTaskService.create_task(db, user_id, data)
            return f"Created: {_task_to_str(task)}"
    except Exception as e:
        return f"Error creating scheduled task: {e}"


@ToolRegistry.register(
    name="get_scheduled_task",
    description="Get a single scheduled task by ID. Returns full details including schedule_config and task_params.",
    category="scheduled_task",
)
def get_scheduled_task(task_id: str) -> str:
    """
    Get a scheduled task by ID.

    Args:
        task_id: UUID of the task.

    Returns:
        Task details or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        tid = UUID(task_id.strip())
    except ValueError:
        return f"Error: Invalid task_id: {task_id}"

    try:
        with SessionLocal() as db:
            task = ScheduledTaskService.get_task(db, tid, user_id)
            if not task:
                return f"Task {task_id} not found."
            return _task_to_str(task)
    except Exception as e:
        return f"Error: {e}"


@ToolRegistry.register(
    name="list_scheduled_tasks",
    description=(
        "List the user's scheduled tasks. Filter by status (active/paused/completed/expired) "
        "or task_type (e.g. send_message, run_agent)."
    ),
    category="scheduled_task",
)
def list_scheduled_tasks(
    status: Optional[str] = None,
    task_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> str:
    """
    List scheduled tasks for the current user.

    Args:
        status: Filter by status.
        task_type: Filter by task_type.
        limit: Max results (default 20).
        offset: Skip first N (default 0).

    Returns:
        Human-readable list or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        with SessionLocal() as db:
            tasks, total = ScheduledTaskService.list_tasks(
                db, user_id, status=status, task_type=task_type, limit=limit, offset=offset
            )
            if not tasks:
                return f"No scheduled tasks found (total: {total})."

            lines = [f"Scheduled tasks ({len(tasks)} of {total}):"]
            for t in tasks:
                next_run = f", next: {t.next_run_at}" if t.next_run_at else ""
                lines.append(
                    f"  - {t.name} (id={t.id}, type={t.task_type}, "
                    f"status={t.status}{next_run})"
                )
            return "\n".join(lines)
    except Exception as e:
        return f"Error listing scheduled tasks: {e}"


@ToolRegistry.register(
    name="update_scheduled_task",
    description=(
        "Update a scheduled task. Pass only fields to change as JSON. "
        "Allowed keys: name, description, schedule_type, schedule_config, timezone, task_type, task_params, max_runs."
    ),
    category="scheduled_task",
)
def update_scheduled_task(task_id: str, update_fields: str) -> str:
    """
    Update a scheduled task (partial update).

    Args:
        task_id: UUID of the task.
        update_fields: JSON object with keys to update, e.g. {"name": "new name", "schedule_config": {"hour": 10, "minute": 30}}.

    Returns:
        Updated task details or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        tid = UUID(task_id.strip())
    except ValueError:
        return f"Error: Invalid task_id: {task_id}"

    try:
        fields = json.loads(update_fields) if isinstance(update_fields, str) else update_fields
        if not isinstance(fields, dict):
            raise ValueError("update_fields must be a JSON object")
    except json.JSONDecodeError as e:
        return f"Error: Invalid update_fields JSON: {e}"

    allowed = {"name", "description", "schedule_type", "schedule_config", "timezone", "task_type", "task_params", "max_runs"}
    extra = set(fields.keys()) - allowed
    if extra:
        return f"Error: Unknown fields {extra}. Allowed: {sorted(allowed)}"

    try:
        data = ScheduledTaskUpdate(**{k: v for k, v in fields.items() if k in allowed})
    except Exception as e:
        return f"Error: {e}"

    try:
        with SessionLocal() as db:
            task = ScheduledTaskService.update_task(db, tid, user_id, data)
            if not task:
                return f"Task {task_id} not found."
            return f"Updated: {_task_to_str(task)}"
    except Exception as e:
        return f"Error updating scheduled task: {e}"


@ToolRegistry.register(
    name="delete_scheduled_task",
    description="Delete a scheduled task by ID. Cannot be undone.",
    category="scheduled_task",
)
def delete_scheduled_task(task_id: str) -> str:
    """
    Delete a scheduled task.

    Args:
        task_id: UUID of the task.

    Returns:
        Success or error string.
    """
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        tid = UUID(task_id.strip())
    except ValueError:
        return f"Error: Invalid task_id: {task_id}"

    try:
        with SessionLocal() as db:
            deleted = ScheduledTaskService.delete_task(db, tid, user_id)
            if not deleted:
                return f"Task {task_id} not found or already deleted."
            return f"Deleted task {task_id}."
    except Exception as e:
        return f"Error deleting scheduled task: {e}"


@ToolRegistry.register(
    name="pause_scheduled_task",
    description="Pause an active scheduled task. It will not run until resumed.",
    category="scheduled_task",
)
def pause_scheduled_task(task_id: str) -> str:
    """Pause a scheduled task."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        tid = UUID(task_id.strip())
    except ValueError:
        return f"Error: Invalid task_id: {task_id}"

    try:
        with SessionLocal() as db:
            task = ScheduledTaskService.pause_task(db, tid, user_id)
            if not task:
                return f"Task {task_id} not found."
            if task.status != "paused":
                return f"Task {task_id} was not active (status={task.status}), cannot pause."
            return f"Paused task {task_id}."
    except Exception as e:
        return f"Error: {e}"


@ToolRegistry.register(
    name="resume_scheduled_task",
    description="Resume a paused scheduled task.",
    category="scheduled_task",
)
def resume_scheduled_task(task_id: str) -> str:
    """Resume a paused scheduled task."""
    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        tid = UUID(task_id.strip())
    except ValueError:
        return f"Error: Invalid task_id: {task_id}"

    try:
        with SessionLocal() as db:
            task = ScheduledTaskService.resume_task(db, tid, user_id)
            if not task:
                return f"Task {task_id} not found."
            if task.status != "active":
                return f"Task {task_id} was not paused (status={task.status}), cannot resume."
            return f"Resumed task {task_id}. Next run: {task.next_run_at}"
    except Exception as e:
        return f"Error: {e}"


@ToolRegistry.register(
    name="trigger_scheduled_task",
    description="Manually trigger a scheduled task to run immediately once. Does not affect the regular schedule.",
    category="scheduled_task",
)
def trigger_scheduled_task(task_id: str) -> str:
    """Trigger a scheduled task to run immediately."""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    user_id = _get_user_id()
    if user_id is None:
        return "Error: No user context available."

    try:
        tid = UUID(task_id.strip())
    except ValueError:
        return f"Error: Invalid task_id: {task_id}"

    def _run_trigger():
        async def _do():
            with SessionLocal() as db:
                return await ScheduledTaskService.trigger_task(db, tid, user_id)

        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(_do())
        finally:
            loop.close()

    try:
        with ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_run_trigger)
            result = future.result(timeout=120)
        if result:
            return f"Triggered task {task_id}. Run completed."
        return f"Task {task_id} not found."
    except Exception as e:
        return f"Error: {e}"
