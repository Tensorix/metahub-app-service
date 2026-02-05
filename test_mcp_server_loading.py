"""
测试 MCP Server 加载问题
"""
import asyncio
from uuid import UUID
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.service.agent import AgentService
from app.service.mcp_server import McpServerService
from app.schema.mcp_server import McpServerCreate

def test_mcp_server_loading():
    """测试 Agent 是否正确加载 MCP servers"""
    
    db = next(get_db())
    
    # 1. 获取第一个 Agent
    agents, total = AgentService.list_agents(db, page=1, page_size=1)
    if not agents:
        print("❌ 没有找到 Agent")
        return
    
    agent = agents[0]
    print(f"✅ 找到 Agent: {agent.name} (ID: {agent.id})")
    
    # 2. 检查 Agent 的 mcp_servers 属性
    print(f"\n📊 Agent.mcp_servers 属性:")
    print(f"   类型: {type(agent.mcp_servers)}")
    print(f"   数量: {len(agent.mcp_servers)}")
    
    if agent.mcp_servers:
        for server in agent.mcp_servers:
            print(f"   - {server.name} ({server.transport}): {server.url}")
            print(f"     启用: {server.is_enabled}, 删除: {server.is_deleted}")
    else:
        print("   (空列表)")
    
    # 3. 直接查询数据库中的 MCP servers
    print(f"\n🔍 数据库中的 MCP Servers:")
    db_servers = McpServerService.list_by_agent(db, agent.id)
    print(f"   数量: {len(db_servers)}")
    
    if db_servers:
        for server in db_servers:
            print(f"   - {server.name} ({server.transport}): {server.url}")
            print(f"     启用: {server.is_enabled}, 删除: {server.is_deleted}")
    else:
        print("   (空列表)")
    
    # 4. 对比结果
    print(f"\n📈 对比:")
    print(f"   Agent.mcp_servers: {len(agent.mcp_servers)} 个")
    print(f"   数据库查询: {len(db_servers)} 个")
    
    if len(agent.mcp_servers) == len(db_servers):
        print("   ✅ 数量一致")
    else:
        print("   ❌ 数量不一致！")
    
    # 5. 测试 get_agent 方法
    print(f"\n🔄 测试 get_agent 方法:")
    agent_reloaded = AgentService.get_agent(db, agent.id)
    if agent_reloaded:
        print(f"   ✅ 重新加载成功")
        print(f"   MCP Servers: {len(agent_reloaded.mcp_servers)} 个")
        if agent_reloaded.mcp_servers:
            for server in agent_reloaded.mcp_servers:
                print(f"   - {server.name}")
    else:
        print("   ❌ 重新加载失败")

if __name__ == "__main__":
    test_mcp_server_loading()
