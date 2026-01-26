"""
DateTime tool - Date and time operations.
"""

from datetime import datetime, timedelta
import pytz
from typing import Optional
from app.agent.tools.registry import ToolRegistry


@ToolRegistry.register(
    name="current_time",
    description="Get the current date and time, optionally in a specific timezone.",
    category="datetime",
)
def current_time(timezone: str = "UTC") -> str:
    """
    Get current date and time.

    Args:
        timezone: Timezone name (e.g., 'UTC', 'Asia/Shanghai', 'America/New_York')

    Returns:
        Current datetime as formatted string
    """
    try:
        tz = pytz.timezone(timezone)
        now = datetime.now(tz)
        return f"Current time in {timezone}: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}"
    except Exception as e:
        return f"Error getting time for timezone '{timezone}': {str(e)}"


@ToolRegistry.register(
    name="date_diff",
    description="Calculate the difference between two dates.",
    category="datetime",
)
def date_diff(date1: str, date2: str) -> str:
    """
    Calculate difference between two dates.

    Args:
        date1: First date (YYYY-MM-DD format)
        date2: Second date (YYYY-MM-DD format)

    Returns:
        Difference in days and human-readable format
    """
    try:
        d1 = datetime.strptime(date1, "%Y-%m-%d")
        d2 = datetime.strptime(date2, "%Y-%m-%d")
        diff = abs((d2 - d1).days)

        years = diff // 365
        months = (diff % 365) // 30
        days = diff % 30

        parts = []
        if years > 0:
            parts.append(f"{years} year{'s' if years > 1 else ''}")
        if months > 0:
            parts.append(f"{months} month{'s' if months > 1 else ''}")
        if days > 0:
            parts.append(f"{days} day{'s' if days > 1 else ''}")

        human = " ".join(parts) if parts else "same day"

        return f"Difference: {diff} days ({human})"
    except Exception as e:
        return f"Error calculating date difference: {str(e)}"


@ToolRegistry.register(
    name="add_days",
    description="Add or subtract days from a date.",
    category="datetime",
)
def add_days(date: str, days: int) -> str:
    """
    Add days to a date.

    Args:
        date: Starting date (YYYY-MM-DD format)
        days: Number of days to add (negative to subtract)

    Returns:
        Resulting date
    """
    try:
        d = datetime.strptime(date, "%Y-%m-%d")
        result = d + timedelta(days=days)
        return f"{date} + {days} days = {result.strftime('%Y-%m-%d')}"
    except Exception as e:
        return f"Error adding days: {str(e)}"
