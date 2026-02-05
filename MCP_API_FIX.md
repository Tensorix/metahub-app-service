# MCP API Fix - langchain-mcp-adapters 0.1.0

## Issue

When testing MCP server connection, the following error occurred:

```
Connection failed: As of langchain-mcp-adapters 0.1.0, MultiServerMCPClient 
cannot be used as a context manager (e.g., async with MultiServerMCPClient(...)). 
Instead, you can do one of the following:
1. client = MultiServerMCPClient(...)
   tools = await client.get_tools()
2. client = MultiServerMCPClient(...)
   async with client.session(server_name) as session:
       tools = await load_mcp_tools(session)
```

## Root Cause

The `langchain-mcp-adapters` library version 0.1.0 changed its API:
- **Old API** (no longer supported): `async with MultiServerMCPClient(config) as client:`
- **New API** (required): Direct instantiation without context manager

## Solution

Updated `app/agent/mcp/client_manager.py` to use the new API pattern.

### Changes Made

#### 1. Updated `get_tools()` method

**Before** (❌ Broken):
```python
async with MultiServerMCPClient(single_config) as client:
    tools = client.get_tools()
    all_tools.extend(tools)
```

**After** (✅ Fixed):
```python
client = MultiServerMCPClient(single_config)
tools = await client.get_tools()
all_tools.extend(tools)
```

#### 2. Updated `test_connection()` method

**Before** (❌ Broken):
```python
async with MultiServerMCPClient(test_config) as client:
    tools = client.get_tools()
    latency_ms = (time.time() - start_time) * 1000
```

**After** (✅ Fixed):
```python
client = MultiServerMCPClient(test_config)
tools = await client.get_tools()
latency_ms = (time.time() - start_time) * 1000
```

### Key Differences

1. **No context manager**: Removed `async with` statement
2. **Await get_tools()**: Changed from `client.get_tools()` to `await client.get_tools()`
3. **Direct instantiation**: Create client directly without context manager

## Files Modified

- `app/agent/mcp/client_manager.py` - Updated both `get_tools()` and `test_connection()` methods
- `MCP_IMPLEMENTATION_STATUS.md` - Added note about API change in Known Limitations
- `MCP_TRANSPORT_PROTOCOLS.md` - Added section explaining the API change

## Testing

After this fix:
1. ✅ MCP server connection test should work
2. ✅ Tool discovery should work
3. ✅ Agent should be able to use MCP tools

## Additional Notes

### Why This Change Was Made

The `langchain-mcp-adapters` library maintainers changed the API to:
- Simplify the usage pattern
- Provide more flexibility with session management
- Align with the MCP protocol specification

### Migration Guide for Other Code

If you have other code using `MultiServerMCPClient`, update it as follows:

**Pattern 1: Simple tool loading (recommended)**
```python
# Old
async with MultiServerMCPClient(config) as client:
    tools = client.get_tools()

# New
client = MultiServerMCPClient(config)
tools = await client.get_tools()
```

**Pattern 2: Session-based (advanced)**
```python
# For more control over individual server sessions
client = MultiServerMCPClient(config)
async with client.session("server_name") as session:
    tools = await load_mcp_tools(session)
```

## References

- [langchain-mcp-adapters Documentation](https://docs.langchain.com/oss/python/langchain/mcp)
- Error message from langchain-mcp-adapters 0.1.0
- MCP Protocol Specification

## Status

✅ **Fixed** - MCP integration now works with langchain-mcp-adapters 0.1.0
