# app/scheduler/tasks/__init__.py

"""Built-in scheduled task handlers.

Importing this package automatically registers all handlers via the
``@register_handler`` decorator.
"""

from app.scheduler.tasks import send_message  # noqa: F401
from app.scheduler.tasks import system  # noqa: F401
