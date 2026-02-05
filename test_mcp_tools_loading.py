"""
测试 MCP 工具加载
"""
import asyncio
from app.db.session import get_db
from app.service.agent import AgentService
from app.agent.factory import AgentFactory

async def test_mcp_tools():
    """测试 Agent 是否正确加载 MCP 工具"""
    
    db = next(get_db())
    
    # 1. 获取第一个 Agent
    agents, total = AgentService.list_agents(db, page=1, page_size=1)
    if not agents:
        print("❌ 没有找到 Agent")
        return
    
    agent = agents[0]
    print(f"✅ 找到 Agent: {agent.name} (ID: {agent.id})")
    print(f"   MCP Servers: {len(agent.mcp_servers)} 个")
    
    # 2. 构建 agent config
    agent_config = AgentFactory.build_agent_config(agent)
    print(f"\n📋 Agent Config:")
    print(f"   _agent_id: {agent_config.get('_agent_id')}")
    print(f"   tools: {agent_config.get('tools', [])}")
    print(f"   mcp_servers: {len(agent_config.get('mcp_servers', []))} 个")
    
    if agent_config.get('mcp_servers'):
        for mcp in agent_config['mcp_servers']:
            print(f"   - {mcp['name']} ({mcp.get('transport', 'NO TRANSPORT!')}): {mcp['url']}")
            print(f"     启用: {mcp['is_enabled']}")
    
    # 3. 创建 DeepAgentService 并获取工具
    print(f"\n🔧 创建 DeepAgentService...")
    from app.agent.deep_agent_service import DeepAgentService
    
    service = DeepAgentService(agent_config)
    
    # 获取内置工具
    builtin_tools = service._get_tools()
    print(f"   内置工具: {len(builtin_tools)} 个")
    for tool in builtin_tools:
        print(f"   - {tool.name}")
    
    # 获取 MCP 工具
    print(f"\n🌐 获取 MCP 工具...")
    mcp_tools = await service._get_mcp_tools()
    print(f"   MCP 工具: {len(mcp_tools)} 个")
    for tool in mcp_tools:
        print(f"   - {tool.name}: {tool.description}")
    
    # 合并工具
    all_tools = service._merge_tools(builtin_tools, mcp_tools)
    print(f"\n✅ 总工具数: {len(all_tools)} 个")
    print(f"   内置: {len(builtin_tools)}")
    print(f"   MCP: {len(mcp_tools)}")
    print(f"   合并后: {len(all_tools)}")

if __name__ == "__main__":
    asyncio.run(test_mcp_tools())
