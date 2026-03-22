"""
MCP Client Manager - 管理 Agent 到外部 MCP Server 的连接.

职责:
- 管理 MultiServerMCPClient 实例的生命周期
- 缓存 MCP 工具列表（基于 TTL）
- 提供工具获取接口供 DeepAgentService 调用
- 连接测试和健康检查
"""

import asyncio
import functools
import logging
import time
from typing import Any, Optional
from uuid import UUID

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.config import config

logger = logging.getLogger(__name__)


def _unwrap_exception_group(e: BaseException) -> BaseException:
    """Extract the root cause from nested ExceptionGroups."""
    while isinstance(e, BaseExceptionGroup) and e.exceptions:
        e = e.exceptions[0]
    return e


def _wrap_mcp_tool(tool: BaseTool) -> BaseTool:
    """Wrap an MCP tool so execution errors return error strings instead of raising.

    This prevents MCP server failures (e.g. 502, timeout) from crashing the
    entire agent stream. The LLM receives the error message and can respond
    gracefully to the user.

    MCP tools are StructuredTool instances with a ``coroutine`` field.
    """
    original_coroutine = getattr(tool, "coroutine", None)
    if original_coroutine is None:
        return tool

    @functools.wraps(original_coroutine)
    async def _safe_coroutine(*args: Any, **kwargs: Any) -> Any:
        try:
            return await original_coroutine(*args, **kwargs)
        except Exception as exc:
            root = _unwrap_exception_group(exc)
            error_msg = f"Tool '{tool.name}' failed: {root}"
            logger.warning(f"MCP tool execution error: {error_msg}", exc_info=True)
            if tool.response_format == "content_and_artifact":
                return error_msg, None
            return error_msg

    tool.coroutine = _safe_coroutine  # type: ignore[attr-defined]
    return tool


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
            [{"name": "db-tools", "transport": "http", "url": "http://...", "headers": {...}}]

        输出格式:
            {"db-tools": {"transport": "http", "url": "http://...", "headers": {...}}}
        
        支持的传输协议 (根据 langchain-mcp-adapters 文档):
            - http (也称为 streamable-http): HTTP 请求通信 (推荐，默认)
            - sse: Server-Sent Events (已被 MCP 规范弃用)
            - stdio: 标准输入/输出，用于本地进程
        """
        server_config = {}
        for server in mcp_servers:
            if not server.get("is_enabled", True):
                continue

            name = server["name"]
            transport = server.get("transport", "http")
            
            # HTTP-based transports (http, sse)
            if transport in ("http", "sse"):
                entry = {
                    "transport": transport,
                    "url": server["url"],
                    "timeout": config.MCP_CONNECTION_TIMEOUT,
                }
                # 添加自定义 headers (支持认证等)
                if server.get("headers"):
                    entry["headers"] = server["headers"]
            
            # stdio transport (本地进程)
            elif transport == "stdio":
                entry = {
                    "transport": "stdio",
                    "command": server.get("command", "python"),
                    "args": server.get("args", []),
                }
                if server.get("env"):
                    entry["env"] = server["env"]
            
            else:
                logger.warning(f"Unsupported transport type: {transport}, skipping server {name}")
                continue

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
                client = MultiServerMCPClient(single_config)
                tools = await client.get_tools()
                all_tools.extend(tools)
                logger.info(
                    f"MCP Server '{server_name}' provided " f"{len(tools)} tools"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to get tools from MCP Server " f"'{server_name}': {e}"
                )
                # 继续处理其他 server

        # Wrap tools so execution errors are returned as strings, not raised
        all_tools = [_wrap_mcp_tool(t) for t in all_tools]

        # 缓存结果
        if all_tools:
            self._tool_cache.set(cache_key, all_tools)

        logger.info(f"Total MCP tools for agent {agent_id}: {len(all_tools)}")
        return all_tools

    async def test_connection(
        self,
        url: str,
        transport: str = "http",
        headers: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """
        测试与 MCP Server 的连接.

        Args:
            url: MCP Server URL
            transport: 传输协议类型 (http, sse, stdio)
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
                    "transport": transport,
                    "url": url,
                    "timeout": config.MCP_CONNECTION_TIMEOUT,
                }
            }
            if headers:
                test_config["test"]["headers"] = headers

            client = MultiServerMCPClient(test_config)
            tools = await client.get_tools()
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
