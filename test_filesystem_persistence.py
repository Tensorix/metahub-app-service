"""
测试文件系统持久化和 session 隔离

验证：
1. 文件写入后重启服务仍然存在（PostgreSQL Store）
2. 不同 session 之间文件隔离
3. 同一 session 内文件共享
"""

import asyncio
from uuid import uuid4
from app.agent.factory import AgentFactory


async def test_persistence():
    """测试持久化存储"""
    print("=" * 60)
    print("测试 1: 文件持久化")
    print("=" * 60)
    
    agent_config = {
        "name": "Test Agent",
        "model": "gpt-4o-mini",
        "model_provider": "openai",
        "system_prompt": "You are a helpful assistant with file system access.",
        "tools": [],
    }
    
    agent_id = uuid4()
    session_id = uuid4()
    
    # 创建 agent
    agent = await AgentFactory.create_agent(agent_id, agent_config)
    
    # 写入文件
    print(f"\n1. Session {session_id} 写入文件...")
    response = await agent.chat(
        message="请在 /memories/test.txt 中写入 'Hello from session'",
        thread_id="thread_1",
        user_id=uuid4(),
        session_id=session_id,
    )
    print(f"Response: {response}")
    
    # 读取文件
    print(f"\n2. 同一 session 读取文件...")
    response = await agent.chat(
        message="请读取 /memories/test.txt 的内容",
        thread_id="thread_2",  # 不同 thread
        user_id=uuid4(),
        session_id=session_id,  # 相同 session
    )
    print(f"Response: {response}")
    print("✅ 预期：能读到 'Hello from session'")
    
    # 清除缓存模拟重启
    print(f"\n3. 清除缓存（模拟重启）...")
    AgentFactory.clear_cache()
    
    # 重新创建 agent
    agent = await AgentFactory.create_agent(agent_id, agent_config)
    
    # 再次读取
    print(f"\n4. 重启后读取文件...")
    response = await agent.chat(
        message="请读取 /memories/test.txt 的内容",
        thread_id="thread_3",
        user_id=uuid4(),
        session_id=session_id,
    )
    print(f"Response: {response}")
    print("✅ 预期：仍然能读到 'Hello from session'（持久化成功）")


async def test_session_isolation():
    """测试 session 隔离"""
    print("\n" + "=" * 60)
    print("测试 2: Session 隔离")
    print("=" * 60)
    
    agent_config = {
        "name": "Test Agent",
        "model": "gpt-4o-mini",
        "model_provider": "openai",
        "system_prompt": "You are a helpful assistant with file system access.",
        "tools": [],
    }
    
    agent_id = uuid4()
    session_a = uuid4()
    session_b = uuid4()
    
    agent = await AgentFactory.create_agent(agent_id, agent_config)
    
    # Session A 写入文件
    print(f"\n1. Session A ({session_a}) 写入文件...")
    response = await agent.chat(
        message="请在 /memories/secret.txt 中写入 'Session A secret'",
        thread_id="thread_a",
        user_id=uuid4(),
        session_id=session_a,
    )
    print(f"Response: {response}")
    
    # Session B 尝试读取
    print(f"\n2. Session B ({session_b}) 尝试读取 Session A 的文件...")
    response = await agent.chat(
        message="请读取 /memories/secret.txt 的内容",
        thread_id="thread_b",
        user_id=uuid4(),
        session_id=session_b,
    )
    print(f"Response: {response}")
    print("✅ 预期：文件不存在（隔离成功）")
    
    # Session B 写入自己的文件
    print(f"\n3. Session B 写入自己的文件...")
    response = await agent.chat(
        message="请在 /memories/secret.txt 中写入 'Session B secret'",
        thread_id="thread_b",
        user_id=uuid4(),
        session_id=session_b,
    )
    print(f"Response: {response}")
    
    # Session A 读取自己的文件
    print(f"\n4. Session A 读取自己的文件...")
    response = await agent.chat(
        message="请读取 /memories/secret.txt 的内容",
        thread_id="thread_a2",
        user_id=uuid4(),
        session_id=session_a,
    )
    print(f"Response: {response}")
    print("✅ 预期：仍然是 'Session A secret'（未被覆盖）")


async def test_namespace_structure():
    """测试 namespace 结构"""
    print("\n" + "=" * 60)
    print("测试 3: Namespace 结构")
    print("=" * 60)
    
    agent_config = {
        "name": "Test Agent",
        "model": "gpt-4o-mini",
        "model_provider": "openai",
        "system_prompt": "You are a helpful assistant.",
        "tools": [],
    }
    
    agent_id = uuid4()
    session_id = uuid4()
    
    agent = await AgentFactory.create_agent(agent_id, agent_config)
    
    # 写入文件
    print(f"\n1. 写入文件到 /memories/...")
    await agent.chat(
        message="请在 /memories/data.txt 中写入 'test data'",
        thread_id="thread_1",
        session_id=session_id,
    )
    
    # 检查 store 中的数据
    print(f"\n2. 检查 PostgreSQL Store 中的数据...")
    store = await AgentFactory.get_store()
    
    # 搜索该 session 的所有文件
    namespace = (str(session_id), "filesystem")
    items = await store.asearch(namespace)
    
    print(f"\nNamespace: {namespace}")
    print(f"找到 {len(items)} 个文件:")
    for item in items:
        print(f"  - Key: {item.key}")
        print(f"    Value: {item.value}")
    
    print("\n✅ 预期：namespace 格式为 (session_id, 'filesystem')")


async def main():
    """运行所有测试"""
    try:
        # 测试 1: 持久化
        await test_persistence()
        
        # 测试 2: Session 隔离
        await test_session_isolation()
        
        # 测试 3: Namespace 结构
        await test_namespace_structure()
        
        print("\n" + "=" * 60)
        print("所有测试完成！")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 清理
        await AgentFactory.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
