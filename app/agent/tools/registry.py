"""
Tool Registry - Central registry for agent tools.

Provides:
- Tool registration via decorators
- Tool retrieval by name
- Tool listing and metadata
"""

from typing import Callable, Optional, Any
from langchain_core.tools import tool as langchain_tool


class ToolRegistry:
    """Central registry for agent tools."""

    _tools: dict[str, Callable] = {}
    _metadata: dict[str, dict[str, Any]] = {}

    @classmethod
    def register(
        cls,
        name: str,
        description: Optional[str] = None,
        category: str = "general",
    ):
        """
        Decorator to register a tool.

        Args:
            name: Unique tool name
            description: Tool description (optional, uses docstring if not provided)
            category: Tool category for grouping

        Usage:
            @ToolRegistry.register("search", category="web")
            def search(query: str) -> str:
                '''Search the web for information.'''
                ...
        """
        def decorator(func: Callable) -> Callable:
            # Wrap with langchain tool decorator
            wrapped = langchain_tool(func)

            # Store in registry
            cls._tools[name] = wrapped
            cls._metadata[name] = {
                "name": name,
                "description": description or func.__doc__ or "",
                "category": category,
                "function": func.__name__,
            }

            return wrapped

        return decorator

    @classmethod
    def get(cls, name: str) -> Optional[Callable]:
        """
        Get a tool by name.

        Args:
            name: Tool name

        Returns:
            Tool function or None if not found
        """
        return cls._tools.get(name)

    @classmethod
    def get_tools(cls, names: list[str]) -> list[Callable]:
        """
        Get multiple tools by name.

        Args:
            names: List of tool names

        Returns:
            List of tool functions (excludes not found)
        """
        return [cls._tools[n] for n in names if n in cls._tools]

    @classmethod
    def get_all(cls) -> list[Callable]:
        """
        Get all registered tools.

        Returns:
            List of all tool functions
        """
        return list(cls._tools.values())

    @classmethod
    def list_tools(cls) -> list[dict[str, Any]]:
        """
        List all registered tools with metadata.

        Returns:
            List of tool metadata dictionaries
        """
        return list(cls._metadata.values())

    @classmethod
    def list_by_category(cls, category: str) -> list[dict[str, Any]]:
        """
        List tools by category.

        Args:
            category: Category name

        Returns:
            List of tool metadata in category
        """
        return [
            m for m in cls._metadata.values()
            if m["category"] == category
        ]

    @classmethod
    def clear(cls):
        """Clear all registered tools. Used for testing."""
        cls._tools.clear()
        cls._metadata.clear()
