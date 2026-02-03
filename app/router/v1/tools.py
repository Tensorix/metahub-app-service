"""
Tools API endpoints - Expose available agent tools.
"""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException

from app.agent.tools.registry import ToolRegistry
from app.schema.tool import (
    ToolInfo,
    ToolListResponse,
    ToolCategoryInfo,
    ToolCategorizedResponse,
)

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=ToolListResponse)
def list_tools(
    category: Optional[str] = Query(None, description="按分类筛选"),
):
    """
    获取所有可用工具列表.

    可选按 category 筛选，如 'math', 'web', 'datetime', 'data' 等。
    """
    if category:
        tools = ToolRegistry.list_by_category(category)
    else:
        tools = ToolRegistry.list_tools()

    return ToolListResponse(
        tools=[ToolInfo(**t) for t in tools],
        total=len(tools),
    )


@router.get("/categories", response_model=ToolCategorizedResponse)
def list_tools_by_category():
    """
    获取按分类组织的工具列表.

    返回所有分类及其包含的工具。
    """
    all_tools = ToolRegistry.list_tools()

    # 按 category 分组
    category_map: dict[str, list[dict]] = {}
    for tool in all_tools:
        cat = tool.get("category", "general")
        if cat not in category_map:
            category_map[cat] = []
        category_map[cat].append(tool)

    # 转换为响应格式
    categories = [
        ToolCategoryInfo(
            category=cat,
            tools=[ToolInfo(**t) for t in tools],
        )
        for cat, tools in sorted(category_map.items())
    ]

    return ToolCategorizedResponse(
        categories=categories,
        total=len(all_tools),
    )


@router.get("/{tool_name}", response_model=ToolInfo)
def get_tool(tool_name: str):
    """
    获取单个工具的详细信息.
    """
    tool = ToolRegistry.get(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    metadata = ToolRegistry._metadata.get(tool_name)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' metadata not found")

    return ToolInfo(**metadata)
