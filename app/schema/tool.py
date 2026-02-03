"""
Tool schemas for API responses.
"""

from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ToolInfo(BaseModel):
    """单个工具的信息."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "calculator",
                "description": "Perform mathematical calculations.",
                "category": "math",
                "function": "calculator",
            }
        }
    )

    name: str = Field(..., description="工具唯一标识名")
    description: str = Field(..., description="工具描述")
    category: str = Field(..., description="工具分类")
    function: str = Field(..., description="对应的函数名")


class ToolListResponse(BaseModel):
    """工具列表响应."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "tools": [
                    {
                        "name": "calculator",
                        "description": "Perform mathematical calculations.",
                        "category": "math",
                        "function": "calculator",
                    }
                ],
                "total": 1,
            }
        }
    )

    tools: list[ToolInfo] = Field(..., description="工具列表")
    total: int = Field(..., description="工具总数")


class ToolCategoryInfo(BaseModel):
    """按分类组织的工具信息."""

    category: str = Field(..., description="分类名称")
    tools: list[ToolInfo] = Field(..., description="该分类下的工具列表")


class ToolCategorizedResponse(BaseModel):
    """按分类组织的工具列表响应."""

    categories: list[ToolCategoryInfo] = Field(..., description="分类列表")
    total: int = Field(..., description="工具总数")
