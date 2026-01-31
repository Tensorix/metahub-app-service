# Step 3: MCPClientManager 核心服务

## 3.1 设计思路

MCPClientManager 是 MCP 集成的核心组件，负责:

1. **连接管理**: 管理到各 MCP Server 的 HTTP 连接
2. **工具发现**: 从 MCP Server 获取可用工具列表并转为 LangChain BaseTool
3. **工具缓存**: 缓存工具列表避免每次对话都重新获取
4. **生命周期**: 连接的建立、复用和清理
5. **健康检查**: 测试 MCP Server 连接并报告状态

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 连接模式 | 无状态（默认） | HTTP 传输天然无状态，每次工具调用独立 |
| 工具缓存 | 内存 + TTL | 避免每次对话都 list_tools，降低延迟 |
| Client 实例管理 | 按 Agent ID 缓存 | 同一 Agent 的多次对话复用同一 Client |
| 错误处理 | 优雅降级 | MCP Server 不可用时，Agent 仍可使用内置工具 |

## 3.2 文件结构

```
app/agent/mcp/
  __init__.py              # 导出 MCPClientManager
  client_manager.py        # 核心管理器
  schemas.py               # 内部数据结构
```

## 3.3 核心实现

### app/agent/mcp/client_manager.py

```python
"""
MCP Client Manager - 管理 Agent 到外部 MCP Server 的连接.

职责:
- 管理 MultiServerMCPClient 实例的生命周期
- 缓存 MCP 工具列表（基于 TTL）
- 提供工具获取接口供 DeepAgentService 调用
- 连接测试和健康检查
"""

import asyncio
import logging
import time
from typing import Any, Optional
from uuid import UUID

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.config import config

logger = logging.getLogger(__name__)


class MCPToolCache:
    """MCP 工具缓存，带 TTL."""

    def __init__(self, ttl: int = 300):
        self._cache: dict[str, list[BaseTool]] = {}
        self._timestamps: dict[str, float] = {}
        self._ttl = ttl

    def get(self, key: str) -> Optional[list[BaseTool]]:
        """获取缓存的工具列表，过期返回 None."""
        if key not in self._cache:
            return None
        if time.time() - self._timestamps.get(key, 0) > self._ttl:
            self.invalidate(key)
            return None
        return self._cache[key]

    def set(self, key: str, tools: list[BaseTool]):
        """缓存工具列表."""
        self._cache[key] = tools
        self._timestamps[key] = time.time()

    def invalidate(self, key: str):
        """使某个 key 的缓存失效."""
        self._cache.pop(key, None)
        self._timestamps.pop(key, None)

    def clear(self):
        """清除所有缓存."""
        self._cache.clear()
        self._timestamps.clear()


class MCPClientManager:
    """
    MCP Client 管理器.

    管理 Agent 到外部 MCP Server 的连接，提供工具获取接口。
    采用无状态 HTTP 连接模式，每次工具调用独立执行。

    使用方式:
        manager = MCPClientManager()
        tools = await manager.get_tools(agent_mcp_servers)
        # tools 是 LangChain BaseTool 列表，可直接传给 Agent
    """

    def __init__(self):
        self._tool_cache = MCPToolCache(ttl=config.MCP_TOOL_CACHE_TTL)
        self._lock = asyncio.Lock()

    def _build_server_config(
        self, mcp_servers: list[dict[str, Any]]
    ) -> dict[str, dict[str, Any]]:
        """
        将数据库中的 MCP Server 配置转换为 MultiServerMCPClient 格式.

        Args:
            mcp_servers: 数据库中的 MCP Server 配置列表

        Returns:
            MultiServerMCPClient 所需的配置字典

        输入格式:
            [{"name": "db-tools", "url": "http://...", "headers": {...}}]

        输出格式:
            {"db-tools": {"transport": "http", "url": "http://...", "headers": {...}}}
        """
        server_config = {}
        for server in mcp_servers:
            if not server.get("is_enabled", True):
                continue

            name = server["name"]
            entry = {
                "transport": "streamable-http",
                "url": server["url"],
            }

            # 添加自定义 headers
            if server.get("headers"):
                entry["headers"] = server["headers"]

            # 添加超时配置
            entry["timeout"] = config.MCP_CONNECTION_TIMEOUT

            server_config[name] = entry

        return server_config

    async def get_tools(
        self,
        agent_id: UUID,
        mcp_servers: list[dict[str, Any]],
    ) -> list[BaseTool]:
        """
        获取 Agent 配置的所有 MCP Server 提供的工具.

        优先从缓存获取，缓存失效时重新从 MCP Server 获取。
        单个 MCP Server 连接失败不影响其他 Server 的工具获取。

        Args:
            agent_id: Agent ID，用于缓存 key
            mcp_servers: MCP Server 配置列表

        Returns:
            LangChain BaseTool 列表
        """
        if not mcp_servers:
            return []

        cache_key = str(agent_id)

        # 检查缓存
        cached = self._tool_cache.get(cache_key)
        if cached is not None:
            logger.debug(f"MCP tools cache hit for agent {agent_id}")
            return cached

        # 过滤启用的 server
        enabled_servers = [s for s in mcp_servers if s.get("is_enabled", True)]
        if not enabled_servers:
            return []

        logger.info(
            f"Fetching MCP tools for agent {agent_id}, "
            f"servers: {[s['name'] for s in enabled_servers]}"
        )

        all_tools: list[BaseTool] = []
        server_config = self._build_server_config(enabled_servers)

        # 逐个 Server 获取工具，单个失败不影响整体
        for server_name, srv_cfg in server_config.items():
            try:
                single_config = {server_name: srv_cfg}
                async with MultiServerMCPClient(single_config) as client:
                    tools = client.get_tools()
                    all_tools.extend(tools)
                    logger.info(
                        f"MCP Server '{server_name}' provided "
                        f"{len(tools)} tools"
                    )
            except Exception as e:
                logger.warning(
                    f"Failed to get tools from MCP Server "
                    f"'{server_name}': {e}"
                )
                # 继续处理其他 server

        # 缓存结果
        if all_tools:
            self._tool_cache.set(cache_key, all_tools)

        logger.info(
            f"Total MCP tools for agent {agent_id}: {len(all_tools)}"
        )
        return all_tools

    async def test_connection(
        self,
        url: str,
        headers: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """
        测试与 MCP Server 的连接.

        Args:
            url: MCP Server URL
            headers: 可选的 HTTP headers

        Returns:
            测试结果字典:
            {
                "success": bool,
                "message": str,
                "tools": [{"name": ..., "description": ...}] or None,
                "latency_ms": float or None,
            }
        """
        start_time = time.time()

        try:
            test_config = {
                "test": {
                    "transport": "streamable-http",
                    "url": url,
                    "timeout": config.MCP_CONNECTION_TIMEOUT,
                }
            }
            if headers:
                test_config["test"]["headers"] = headers

            async with MultiServerMCPClient(test_config) as client:
                tools = client.get_tools()
                latency_ms = (time.time() - start_time) * 1000

                tool_info = [
                    {
                        "name": t.name,
                        "description": t.description or "",
                    }
                    for t in tools
                ]

                return {
                    "success": True,
                    "message": f"Connected. Found {len(tools)} tools.",
                    "tools": tool_info,
                    "latency_ms": round(latency_ms, 2),
                }

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.warning(f"MCP connection test failed for {url}: {e}")
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}",
                "tools": None,
                "latency_ms": round(latency_ms, 2),
            }

    def invalidate_cache(self, agent_id: UUID):
        """
        使指定 Agent 的 MCP 工具缓存失效.

        在 Agent 的 MCP Server 配置变更时调用。
        """
        self._tool_cache.invalidate(str(agent_id))
        logger.info(f"MCP tool cache invalidated for agent {agent_id}")

    def clear_cache(self):
        """清除所有缓存."""
        self._tool_cache.clear()
        logger.info("All MCP tool caches cleared")


# 全局单例
_mcp_manager: Optional[MCPClientManager] = None


def get_mcp_client_manager() -> MCPClientManager:
    """获取 MCPClientManager 全局单例."""
    global _mcp_manager
    if _mcp_manager is None:
        _mcp_manager = MCPClientManager()
    return _mcp_manager
```

### app/agent/mcp/__init__.py

```python
from app.agent.mcp.client_manager import MCPClientManager, get_mcp_client_manager

__all__ = ["MCPClientManager", "get_mcp_client_manager"]
```

## 3.4 工具命名冲突处理

当多个 MCP Server 提供同名工具时，需要处理命名冲突。策略:

1. **命名空间前缀**: 默认不添加前缀。如果检测到同名工具，自动为后面的工具添加 `{server_name}_` 前缀
2. **日志警告**: 发现重名时记录 warning 日志
3. **内置工具优先**: MCP 工具与 ToolRegistry 内置工具重名时，内置工具优先

```python
# 在 get_tools 方法中添加去重逻辑:
def _deduplicate_tools(self, tools: list[BaseTool]) -> list[BaseTool]:
    """去重工具列表，同名工具保留第一个."""
    seen = set()
    deduped = []
    for tool in tools:
        if tool.name not in seen:
            seen.add(tool.name)
            deduped.append(tool)
        else:
            logger.warning(f"Duplicate MCP tool name: {tool.name}, skipped")
    return deduped
```

## 3.5 错误处理策略

| 场景 | 处理方式 |
|------|----------|
| MCP Server 连接超时 | 跳过该 Server，记录 warning，使用其他 Server 的工具 |
| MCP Server 返回错误 | 跳过该 Server，记录错误信息到 `last_error` |
| 单个工具调用失败 | 由 LangChain 工具框架处理，返回错误信息给 LLM |
| 所有 MCP Server 不可用 | Agent 退化为仅使用内置工具，记录 warning |
| 认证失败 (401/403) | 记录错误，建议用户检查 headers 配置 |

## 3.6 性能考量

1. **工具缓存**: 默认 5 分钟 TTL，避免每次对话都请求 MCP Server
2. **并行获取**: 多个 MCP Server 可并行获取工具列表（后续优化）
3. **无状态连接**: HTTP 传输默认无状态，无需维护长连接
4. **懒加载**: Agent 第一次对话时才建立 MCP 连接，不在启动时预连接
