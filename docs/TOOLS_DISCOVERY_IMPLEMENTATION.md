# Tools Discovery API 实现文档

> **状态**: 待审核  
> **创建日期**: 2026-02-03  
> **相关组件**: 后端 API、前端 AgentDialog

## 问题背景

### 当前问题

前端 `AgentDialog.tsx` 中硬编码了工具列表，与后端实际注册的工具严重不一致：

**前端硬编码 (4 个):**
```typescript
// frontend/src/components/AgentDialog.tsx:24
const AVAILABLE_TOOLS = ['calculator', 'search', 'datetime', 'execute'];
```

**后端实际注册 (9 个):**

| 注册名 | 分类 | 来源文件 | 前端状态 |
|--------|------|----------|----------|
| `calculator` | math | calculator.py | ✅ 匹配 |
| `unit_convert` | math | calculator.py | ❌ 缺失 |
| `search` | web | search.py | ✅ 匹配 |
| `search_news` | web | search.py | ❌ 缺失 |
| `current_time` | datetime | datetime_tool.py | ❌ 缺失 (前端用 'datetime') |
| `date_diff` | datetime | datetime_tool.py | ❌ 缺失 |
| `add_days` | datetime | datetime_tool.py | ❌ 缺失 |
| `search_messages` | data | message_search.py | ❌ 缺失 |
| `get_message_context` | data | message_search.py | ❌ 缺失 |

### 核心问题

1. **名称不匹配** - 前端有 `datetime`，后端实际是 `current_time`、`date_diff`、`add_days`
2. **幽灵工具** - 前端有 `execute`，后端不存在
3. **缺失工具** - 7 个后端工具在前端不可见
4. **静默失败** - `ToolRegistry.get_tools()` 对找不到的工具静默跳过
5. **无发现机制** - 没有 API 端点暴露可用工具列表

---

## 解决方案概览

```
┌─────────────────┐    GET /api/v1/tools     ┌──────────────────┐
│   前端组件      │ ◄──────────────────────►  │   Tools Router   │
│  AgentDialog    │                           │                  │
└─────────────────┘                           └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  ToolRegistry    │
                                              │  .list_tools()   │
                                              └──────────────────┘
```

---

## 第一部分：后端实现

### 1.1 新增 Schema 定义

**文件**: `app/schema/tool.py`（新建）

```python
"""
Tool schemas for API responses.
"""

from typing import Optional
from pydantic import BaseModel, Field


class ToolInfo(BaseModel):
    """单个工具的信息."""

    name: str = Field(..., description="工具唯一标识名")
    description: str = Field(..., description="工具描述")
    category: str = Field(..., description="工具分类")
    function: str = Field(..., description="对应的函数名")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "calculator",
                "description": "Perform mathematical calculations.",
                "category": "math",
                "function": "calculator",
            }
        }


class ToolListResponse(BaseModel):
    """工具列表响应."""

    tools: list[ToolInfo] = Field(..., description="工具列表")
    total: int = Field(..., description="工具总数")

    class Config:
        json_schema_extra = {
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


class ToolCategoryInfo(BaseModel):
    """按分类组织的工具信息."""

    category: str = Field(..., description="分类名称")
    tools: list[ToolInfo] = Field(..., description="该分类下的工具列表")


class ToolCategorizedResponse(BaseModel):
    """按分类组织的工具列表响应."""

    categories: list[ToolCategoryInfo] = Field(..., description="分类列表")
    total: int = Field(..., description="工具总数")
```

### 1.2 新增 Router

**文件**: `app/router/v1/tools.py`（新建）

```python
"""
Tools API endpoints - Expose available agent tools.
"""

from typing import Optional
from fastapi import APIRouter, Query

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
    from fastapi import HTTPException

    tool = ToolRegistry.get(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    metadata = ToolRegistry._metadata.get(tool_name)
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' metadata not found")

    return ToolInfo(**metadata)
```

### 1.3 注册 Router

**文件**: `app/router/v1/__init__.py`

需要添加 tools router 的注册：

```python
from app.router.v1.tools import router as tools_router

# 在 router 列表中添加
routers = [
    # ... existing routers ...
    tools_router,
]
```

### 1.4 修复静默失败问题

**文件**: `app/agent/tools/registry.py`

修改 `get_tools()` 方法，对找不到的工具抛出警告：

```python
import logging

logger = logging.getLogger(__name__)

@classmethod
def get_tools(cls, names: list[str]) -> list[Callable]:
    """
    Get multiple tools by name.

    Args:
        names: List of tool names

    Returns:
        List of tool functions (excludes not found)
    """
    result = []
    not_found = []

    for name in names:
        if name in cls._tools:
            result.append(cls._tools[name])
        else:
            not_found.append(name)

    if not_found:
        logger.warning(f"Tools not found in registry: {not_found}")

    return result
```

**可选增强**: 添加严格模式

```python
@classmethod
def get_tools(cls, names: list[str], strict: bool = False) -> list[Callable]:
    """
    Get multiple tools by name.

    Args:
        names: List of tool names
        strict: If True, raise error for missing tools

    Returns:
        List of tool functions

    Raises:
        ValueError: If strict=True and any tool not found
    """
    result = []
    not_found = []

    for name in names:
        if name in cls._tools:
            result.append(cls._tools[name])
        else:
            not_found.append(name)

    if not_found:
        if strict:
            raise ValueError(f"Tools not found in registry: {not_found}")
        logger.warning(f"Tools not found in registry: {not_found}")

    return result
```

---

## 第二部分：前端实现

### 2.1 新增 API 函数

**文件**: `frontend/src/lib/toolsApi.ts`（新建）

```typescript
/**
 * Tools API - Fetch available agent tools from backend.
 */

import { apiRequest } from './api';

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  function: string;
}

export interface ToolListResponse {
  tools: ToolInfo[];
  total: number;
}

export interface ToolCategoryInfo {
  category: string;
  tools: ToolInfo[];
}

export interface ToolCategorizedResponse {
  categories: ToolCategoryInfo[];
  total: number;
}

/**
 * 获取所有可用工具列表
 */
export async function listTools(category?: string): Promise<ToolListResponse> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiRequest<ToolListResponse>(`/api/v1/tools${params}`);
}

/**
 * 获取按分类组织的工具列表
 */
export async function listToolsByCategory(): Promise<ToolCategorizedResponse> {
  return apiRequest<ToolCategorizedResponse>('/api/v1/tools/categories');
}

/**
 * 获取单个工具详情
 */
export async function getToolInfo(toolName: string): Promise<ToolInfo> {
  return apiRequest<ToolInfo>(`/api/v1/tools/${encodeURIComponent(toolName)}`);
}
```

### 2.2 新增 React Hook

**文件**: `frontend/src/hooks/useTools.ts`（新建）

```typescript
/**
 * useTools hook - Manage tool fetching with caching.
 */

import { useState, useEffect, useCallback } from 'react';
import { listTools, listToolsByCategory, ToolInfo, ToolCategoryInfo } from '@/lib/toolsApi';

interface UseToolsResult {
  tools: ToolInfo[];
  categories: ToolCategoryInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// 简单的内存缓存
let toolsCache: ToolInfo[] | null = null;
let categoriesCache: ToolCategoryInfo[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export function useTools(): UseToolsResult {
  const [tools, setTools] = useState<ToolInfo[]>(toolsCache || []);
  const [categories, setCategories] = useState<ToolCategoryInfo[]>(categoriesCache || []);
  const [loading, setLoading] = useState(!toolsCache);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    // 检查缓存是否有效
    if (toolsCache && Date.now() - cacheTime < CACHE_TTL) {
      setTools(toolsCache);
      setCategories(categoriesCache || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [toolsRes, categoriesRes] = await Promise.all([
        listTools(),
        listToolsByCategory(),
      ]);

      toolsCache = toolsRes.tools;
      categoriesCache = categoriesRes.categories;
      cacheTime = Date.now();

      setTools(toolsRes.tools);
      setCategories(categoriesRes.categories);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tools';
      setError(message);
      console.error('Failed to fetch tools:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  return {
    tools,
    categories,
    loading,
    error,
    refetch: fetchTools,
  };
}

/**
 * 获取工具名称到描述的映射
 */
export function useToolDescriptions(): Record<string, string> {
  const { tools } = useTools();
  const map: Record<string, string> = {};
  for (const tool of tools) {
    map[tool.name] = tool.description;
  }
  return map;
}
```

### 2.3 修改 AgentDialog 组件

**文件**: `frontend/src/components/AgentDialog.tsx`

**变更 1**: 删除硬编码，导入 hook

```diff
import { useState, useEffect } from 'react';
+ import { useTools } from '@/hooks/useTools';
// ... other imports

- const AVAILABLE_TOOLS = ['calculator', 'search', 'datetime', 'execute'];
```

**变更 2**: 在组件内使用 hook

```typescript
export function AgentDialog({ open, onOpenChange, agent, onSubmit }: AgentDialogProps) {
  // 获取可用工具列表
  const { tools, categories, loading: toolsLoading, error: toolsError } = useTools();

  // 生成工具名称列表（用于选择）
  const availableTools = tools.map(t => t.name);

  // ... rest of component
}
```

**变更 3**: 改进工具选择 UI（按分类分组）

```tsx
{/* Tools Section */}
<div className="space-y-2">
  <Label>Tools</Label>
  {toolsLoading ? (
    <div className="text-sm text-muted-foreground">Loading tools...</div>
  ) : toolsError ? (
    <div className="text-sm text-destructive">
      Failed to load tools: {toolsError}
    </div>
  ) : (
    <div className="space-y-3">
      {categories.map((category) => (
        <div key={category.category} className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase">
            {category.category}
          </div>
          <div className="flex flex-wrap gap-2">
            {category.tools.map((tool) => {
              const isSelected = formData.tools.includes(tool.name);
              return (
                <Badge
                  key={tool.name}
                  variant={isSelected ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-primary/90"
                  onClick={() => toggleTool(tool.name)}
                  title={tool.description}
                >
                  {tool.name}
                  {isSelected && <X className="ml-1 h-3 w-3" />}
                </Badge>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

---

## 第三部分：API 规范

### 端点定义

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/v1/tools` | 获取工具列表 | 否 |
| GET | `/api/v1/tools/categories` | 按分类获取工具 | 否 |
| GET | `/api/v1/tools/{tool_name}` | 获取单个工具详情 | 否 |

### 响应示例

**GET /api/v1/tools**

```json
{
  "tools": [
    {
      "name": "calculator",
      "description": "Perform mathematical calculations. Supports basic arithmetic and common functions.",
      "category": "math",
      "function": "calculator"
    },
    {
      "name": "unit_convert",
      "description": "Convert between common units (length, weight, temperature).",
      "category": "math",
      "function": "unit_convert"
    },
    {
      "name": "search",
      "description": "Search the web for information on a given topic.",
      "category": "web",
      "function": "search"
    },
    {
      "name": "search_news",
      "description": "Search for recent news articles on a topic.",
      "category": "web",
      "function": "search_news"
    },
    {
      "name": "current_time",
      "description": "Get the current date and time, optionally in a specific timezone.",
      "category": "datetime",
      "function": "current_time"
    },
    {
      "name": "date_diff",
      "description": "Calculate the difference between two dates.",
      "category": "datetime",
      "function": "date_diff"
    },
    {
      "name": "add_days",
      "description": "Add or subtract days from a date.",
      "category": "datetime",
      "function": "add_days"
    },
    {
      "name": "search_messages",
      "description": "Search through the user's PM and group chat messages...",
      "category": "data",
      "function": "search_messages"
    },
    {
      "name": "get_message_context",
      "description": "Get surrounding messages for context.",
      "category": "data",
      "function": "get_message_context"
    }
  ],
  "total": 9
}
```

**GET /api/v1/tools/categories**

```json
{
  "categories": [
    {
      "category": "data",
      "tools": [
        {"name": "search_messages", "description": "...", "category": "data", "function": "search_messages"},
        {"name": "get_message_context", "description": "...", "category": "data", "function": "get_message_context"}
      ]
    },
    {
      "category": "datetime",
      "tools": [
        {"name": "current_time", "description": "...", "category": "datetime", "function": "current_time"},
        {"name": "date_diff", "description": "...", "category": "datetime", "function": "date_diff"},
        {"name": "add_days", "description": "...", "category": "datetime", "function": "add_days"}
      ]
    },
    {
      "category": "math",
      "tools": [
        {"name": "calculator", "description": "...", "category": "math", "function": "calculator"},
        {"name": "unit_convert", "description": "...", "category": "math", "function": "unit_convert"}
      ]
    },
    {
      "category": "web",
      "tools": [
        {"name": "search", "description": "...", "category": "web", "function": "search"},
        {"name": "search_news", "description": "...", "category": "web", "function": "search_news"}
      ]
    }
  ],
  "total": 9
}
```

---

## 第四部分：数据迁移

### 4.1 现有 Agent 工具名修复

需要检查数据库中已保存的 agent，修复无效的工具名：

```sql
-- 查找使用无效工具的 agents
SELECT id, name, tools 
FROM agents 
WHERE tools @> '["datetime"]'::jsonb 
   OR tools @> '["execute"]'::jsonb;
```

**迁移策略**:

| 旧工具名 | 新工具名 | 说明 |
|----------|----------|------|
| `datetime` | `current_time` | 自动替换 |
| `execute` | (删除) | 无对应工具，从 tools 数组中移除 |

### 4.2 迁移脚本

**文件**: `scripts/migrate_agent_tools.py`（新建）

```python
"""
Migrate agent tools to fix invalid tool names.
"""

import json
from sqlalchemy import create_engine, text
from app.config.settings import settings

# 工具名映射
TOOL_MAPPINGS = {
    "datetime": "current_time",  # datetime 映射到 current_time
}

# 需要移除的无效工具
INVALID_TOOLS = {"execute"}


def migrate_agent_tools():
    """Migrate agent tools to valid names."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.begin() as conn:
        # 获取所有 agents
        result = conn.execute(text("SELECT id, name, tools FROM agents"))
        agents = result.fetchall()

        updated = 0
        for agent_id, agent_name, tools in agents:
            if not tools:
                continue

            original_tools = set(tools)
            new_tools = []

            for tool in tools:
                if tool in INVALID_TOOLS:
                    print(f"  Removing invalid tool '{tool}' from agent '{agent_name}'")
                    continue
                elif tool in TOOL_MAPPINGS:
                    new_tool = TOOL_MAPPINGS[tool]
                    print(f"  Mapping '{tool}' -> '{new_tool}' for agent '{agent_name}'")
                    new_tools.append(new_tool)
                else:
                    new_tools.append(tool)

            # 去重
            new_tools = list(dict.fromkeys(new_tools))

            if set(new_tools) != original_tools:
                conn.execute(
                    text("UPDATE agents SET tools = :tools WHERE id = :id"),
                    {"tools": json.dumps(new_tools), "id": agent_id},
                )
                updated += 1

        print(f"\nMigration complete. Updated {updated} agents.")


if __name__ == "__main__":
    migrate_agent_tools()
```

---

## 第五部分：测试计划

### 5.1 后端测试

**文件**: `tests/test_tools_api.py`（新建）

```python
"""Tests for tools API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_list_tools(client):
    """Test GET /api/v1/tools returns all tools."""
    response = client.get("/api/v1/tools")
    assert response.status_code == 200

    data = response.json()
    assert "tools" in data
    assert "total" in data
    assert data["total"] >= 9  # 至少 9 个工具

    # 验证必需的工具存在
    tool_names = {t["name"] for t in data["tools"]}
    assert "calculator" in tool_names
    assert "search" in tool_names
    assert "current_time" in tool_names
    assert "search_messages" in tool_names


def test_list_tools_by_category(client):
    """Test GET /api/v1/tools with category filter."""
    response = client.get("/api/v1/tools?category=math")
    assert response.status_code == 200

    data = response.json()
    assert all(t["category"] == "math" for t in data["tools"])


def test_list_tools_categories(client):
    """Test GET /api/v1/tools/categories returns grouped tools."""
    response = client.get("/api/v1/tools/categories")
    assert response.status_code == 200

    data = response.json()
    assert "categories" in data
    assert "total" in data

    category_names = {c["category"] for c in data["categories"]}
    assert "math" in category_names
    assert "datetime" in category_names


def test_get_tool_info(client):
    """Test GET /api/v1/tools/{name} returns tool details."""
    response = client.get("/api/v1/tools/calculator")
    assert response.status_code == 200

    data = response.json()
    assert data["name"] == "calculator"
    assert data["category"] == "math"
    assert "description" in data


def test_get_tool_not_found(client):
    """Test GET /api/v1/tools/{name} returns 404 for unknown tool."""
    response = client.get("/api/v1/tools/nonexistent")
    assert response.status_code == 404
```

### 5.2 前端测试

```typescript
// frontend/src/hooks/__tests__/useTools.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { useTools } from '../useTools';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      tools: [
        { name: 'calculator', description: 'Math', category: 'math', function: 'calculator' }
      ],
      total: 1
    })
  })
) as jest.Mock;

describe('useTools', () => {
  it('should fetch tools on mount', async () => {
    const { result } = renderHook(() => useTools());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tools.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
  });
});
```

---

## 第六部分：实现步骤

### 阶段 1：后端 API（预计 2 小时）

- [ ] 1.1 创建 `app/schema/tool.py`
- [ ] 1.2 创建 `app/router/v1/tools.py`
- [ ] 1.3 在 `app/router/v1/__init__.py` 注册 router
- [ ] 1.4 修复 `ToolRegistry.get_tools()` 静默失败问题
- [ ] 1.5 编写后端测试
- [ ] 1.6 验证 API 响应

### 阶段 2：前端适配（预计 2 小时）

- [ ] 2.1 创建 `frontend/src/lib/toolsApi.ts`
- [ ] 2.2 创建 `frontend/src/hooks/useTools.ts`
- [ ] 2.3 修改 `AgentDialog.tsx` 移除硬编码
- [ ] 2.4 实现按分类显示工具的 UI
- [ ] 2.5 添加 loading/error 状态处理

### 阶段 3：数据迁移（预计 1 小时）

- [ ] 3.1 编写迁移脚本
- [ ] 3.2 在测试环境验证
- [ ] 3.3 执行生产环境迁移

### 阶段 4：测试与验证（预计 1 小时）

- [ ] 4.1 端到端测试：创建新 Agent 并选择工具
- [ ] 4.2 验证工具实际可用
- [ ] 4.3 验证旧 Agent 工具配置正常工作

---

## 第七部分：后续扩展

### 7.1 工具权限控制

未来可为工具添加权限控制：

```python
class ToolInfo(BaseModel):
    name: str
    description: str
    category: str
    requires_auth: bool = False  # 是否需要特定权限
    allowed_roles: list[str] = []  # 允许使用的角色
```

### 7.2 工具参数 Schema 暴露

可扩展 API 返回工具的参数定义：

```python
class ToolInfoWithParams(ToolInfo):
    parameters: dict  # JSON Schema for tool parameters
```

### 7.3 用户自定义工具

支持用户上传/注册自定义工具：

```
POST /api/v1/tools/custom
DELETE /api/v1/tools/custom/{name}
```

---

## 附录：文件变更清单

| 操作 | 文件路径 |
|------|----------|
| 新建 | `app/schema/tool.py` |
| 新建 | `app/router/v1/tools.py` |
| 修改 | `app/router/v1/__init__.py` |
| 修改 | `app/agent/tools/registry.py` |
| 新建 | `frontend/src/lib/toolsApi.ts` |
| 新建 | `frontend/src/hooks/useTools.ts` |
| 修改 | `frontend/src/components/AgentDialog.tsx` |
| 新建 | `scripts/migrate_agent_tools.py` |
| 新建 | `tests/test_tools_api.py` |

---

## 审核检查清单

- [ ] API 设计是否符合 RESTful 规范？
- [ ] 是否需要为工具 API 添加认证？
- [ ] 前端缓存策略是否合理（5 分钟 TTL）？
- [ ] 数据迁移脚本是否需要回滚机制？
- [ ] 是否需要在 Agent 保存时校验工具名有效性？
