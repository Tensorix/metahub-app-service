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
