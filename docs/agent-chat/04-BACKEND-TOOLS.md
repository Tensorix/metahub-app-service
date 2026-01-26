# Step 4: 自定义工具框架

## 1. 目标

- 实现工具注册表 (`ToolRegistry`)
- 实现内置工具示例
- 支持动态工具加载

## 2. 文件结构

```
app/agent/tools/
├── __init__.py       # 导出注册表
├── registry.py       # 工具注册表
└── builtin/
    ├── __init__.py   # 导出内置工具
    ├── search.py     # 搜索工具
    ├── calculator.py # 计算器工具
    └── datetime.py   # 日期时间工具
```

## 3. 实现详情

### 3.1 app/agent/tools/__init__.py

```python
"""
Agent tools module.

Provides:
- ToolRegistry: Central registry for all tools
- Builtin tools: search, calculator, datetime
"""

from .registry import ToolRegistry

# Import builtin tools to trigger registration
from . import builtin

__all__ = ["ToolRegistry"]
```

### 3.2 app/agent/tools/registry.py

```python
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
```

### 3.3 app/agent/tools/builtin/__init__.py

```python
"""
Builtin tools for agents.

Available tools:
- search: Web search
- calculator: Mathematical calculations
- datetime: Date and time operations
"""

from . import search
from . import calculator
from . import datetime_tool

__all__ = ["search", "calculator", "datetime_tool"]
```

### 3.4 app/agent/tools/builtin/search.py

```python
"""
Search tool - Web search capabilities.
"""

from typing import Optional
from app.agent.tools.registry import ToolRegistry


@ToolRegistry.register(
    name="search",
    description="Search the web for information on a given topic.",
    category="web",
)
def search(query: str, max_results: int = 5) -> str:
    """
    Search the web for information.

    Args:
        query: Search query string
        max_results: Maximum number of results to return

    Returns:
        Search results as formatted text
    """
    # TODO: Implement actual web search
    # For now, return a placeholder
    # Options:
    # 1. Use SerpAPI
    # 2. Use Tavily
    # 3. Use DuckDuckGo
    # 4. Use custom search endpoint

    return f"[Search results for '{query}' - max {max_results} results]\n\nNo results found. Search functionality not yet implemented."


@ToolRegistry.register(
    name="search_news",
    description="Search for recent news articles on a topic.",
    category="web",
)
def search_news(query: str, days: int = 7) -> str:
    """
    Search for recent news articles.

    Args:
        query: News topic to search
        days: Number of days to look back

    Returns:
        News articles as formatted text
    """
    return f"[News search for '{query}' - last {days} days]\n\nNo news found. News search not yet implemented."
```

### 3.5 app/agent/tools/builtin/calculator.py

```python
"""
Calculator tool - Mathematical calculations.
"""

import math
from typing import Union
from app.agent.tools.registry import ToolRegistry


@ToolRegistry.register(
    name="calculator",
    description="Perform mathematical calculations. Supports basic arithmetic and common functions.",
    category="math",
)
def calculator(expression: str) -> str:
    """
    Evaluate a mathematical expression.

    Args:
        expression: Mathematical expression to evaluate
                   Supports: +, -, *, /, **, sqrt, sin, cos, tan, log, etc.

    Returns:
        Calculation result as string
    """
    # Safe math functions
    safe_dict = {
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "sum": sum,
        "pow": pow,
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "log": math.log,
        "log10": math.log10,
        "log2": math.log2,
        "exp": math.exp,
        "pi": math.pi,
        "e": math.e,
        "floor": math.floor,
        "ceil": math.ceil,
    }

    try:
        # Evaluate expression in safe context
        result = eval(expression, {"__builtins__": {}}, safe_dict)
        return f"Result: {result}"
    except Exception as e:
        return f"Error calculating '{expression}': {str(e)}"


@ToolRegistry.register(
    name="unit_convert",
    description="Convert between common units (length, weight, temperature).",
    category="math",
)
def unit_convert(value: float, from_unit: str, to_unit: str) -> str:
    """
    Convert between units.

    Args:
        value: Numeric value to convert
        from_unit: Source unit (e.g., 'km', 'kg', 'c')
        to_unit: Target unit (e.g., 'mi', 'lb', 'f')

    Returns:
        Converted value as string
    """
    # Length conversions (base: meters)
    length_to_m = {
        "m": 1, "km": 1000, "cm": 0.01, "mm": 0.001,
        "mi": 1609.344, "ft": 0.3048, "in": 0.0254, "yd": 0.9144,
    }

    # Weight conversions (base: kg)
    weight_to_kg = {
        "kg": 1, "g": 0.001, "mg": 0.000001,
        "lb": 0.453592, "oz": 0.0283495,
    }

    from_unit = from_unit.lower()
    to_unit = to_unit.lower()

    # Temperature
    if from_unit in ["c", "celsius"] and to_unit in ["f", "fahrenheit"]:
        result = value * 9/5 + 32
        return f"{value}°C = {result:.2f}°F"
    elif from_unit in ["f", "fahrenheit"] and to_unit in ["c", "celsius"]:
        result = (value - 32) * 5/9
        return f"{value}°F = {result:.2f}°C"

    # Length
    if from_unit in length_to_m and to_unit in length_to_m:
        meters = value * length_to_m[from_unit]
        result = meters / length_to_m[to_unit]
        return f"{value} {from_unit} = {result:.4f} {to_unit}"

    # Weight
    if from_unit in weight_to_kg and to_unit in weight_to_kg:
        kg = value * weight_to_kg[from_unit]
        result = kg / weight_to_kg[to_unit]
        return f"{value} {from_unit} = {result:.4f} {to_unit}"

    return f"Cannot convert from {from_unit} to {to_unit}"
```

### 3.6 app/agent/tools/builtin/datetime_tool.py

```python
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
```

## 4. 使用方法

### 4.1 在 Agent 配置中启用工具

```python
agent_config = {
    "model": "deepseek-chat",
    "tools": ["search", "calculator", "current_time"],
    "system_prompt": "You are a helpful assistant with access to search, calculator, and time tools.",
}
```

### 4.2 创建自定义工具

```python
from app.agent.tools.registry import ToolRegistry

@ToolRegistry.register(
    name="my_custom_tool",
    description="My custom tool description",
    category="custom",
)
def my_custom_tool(param1: str, param2: int = 10) -> str:
    """
    Tool docstring - used if description not provided.

    Args:
        param1: First parameter
        param2: Second parameter with default

    Returns:
        Result string
    """
    return f"Result: {param1} - {param2}"
```

### 4.3 列出可用工具

```python
from app.agent.tools import ToolRegistry

# List all tools
tools = ToolRegistry.list_tools()
for tool in tools:
    print(f"{tool['name']}: {tool['description']}")

# List by category
math_tools = ToolRegistry.list_by_category("math")
```

## 5. 工具设计原则

### 5.1 命名规范

- 使用小写字母和下划线
- 名称应描述功能：`search`, `calculate`, `get_weather`
- 避免过于泛化：`do_action` ❌ → `send_email` ✅

### 5.2 参数设计

- 使用类型注解
- 提供默认值
- 参数名应自解释

```python
# Good
def search(query: str, max_results: int = 5) -> str:
    ...

# Bad
def search(q, n=5):
    ...
```

### 5.3 返回值

- 始终返回字符串
- 包含足够上下文信息
- 错误时返回描述性错误信息

```python
# Good
return f"Found {len(results)} results for '{query}'"

# Bad
return str(results)
```

### 5.4 错误处理

- 捕获异常并返回友好错误
- 不要抛出异常到 Agent

```python
try:
    result = do_something()
    return f"Success: {result}"
except SomeError as e:
    return f"Error: Could not complete action - {str(e)}"
```

## 6. 内置工具列表

| 工具名 | 类别 | 描述 |
|--------|------|------|
| `search` | web | 网页搜索 |
| `search_news` | web | 新闻搜索 |
| `calculator` | math | 数学计算 |
| `unit_convert` | math | 单位转换 |
| `current_time` | datetime | 获取当前时间 |
| `date_diff` | datetime | 计算日期差 |
| `add_days` | datetime | 日期加减 |

## 7. 测试

```python
# tests/test_tools.py
import pytest
from app.agent.tools import ToolRegistry

def test_registry():
    # List all tools
    tools = ToolRegistry.list_tools()
    assert len(tools) > 0

    # Get specific tool
    calc = ToolRegistry.get("calculator")
    assert calc is not None

    # Invoke tool
    result = calc.invoke({"expression": "2 + 2"})
    assert "4" in result

def test_calculator():
    calc = ToolRegistry.get("calculator")
    assert "4" in calc.invoke({"expression": "2 + 2"})
    assert "Error" in calc.invoke({"expression": "invalid"})

def test_current_time():
    time_tool = ToolRegistry.get("current_time")
    result = time_tool.invoke({"timezone": "UTC"})
    assert "UTC" in result
```

## 8. 下一步

完成工具框架后，进入 [05-FRONTEND-API.md](./05-FRONTEND-API.md) 实现前端 API 客户端。
