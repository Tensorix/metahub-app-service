"""测试 AsyncPostgresStore 初始化"""

import asyncio
from app.agent.factory import AgentFactory


async def test_store_init():
    """测试 store 初始化"""
    print("测试 AsyncPostgresStore 初始化...")
    
    try:
        # 获取 store
        store = await AgentFactory.get_store()
        print(f"✅ Store 创建成功: {type(store)}")
        
        # 测试基本操作
        print("\n测试基本操作...")
        namespace = ("test", "filesystem")
        key = "/test.txt"
        value = {"content": "test data", "created_at": "2024-01-01"}
        
        # 写入
        await store.aput(namespace, key, value)
        print(f"✅ 写入成功")
        
        # 读取
        item = await store.aget(namespace, key)
        print(f"✅ 读取成功: {item.value if item else 'None'}")
        
        # 搜索
        items = await store.asearch(namespace)
        print(f"✅ 搜索成功: 找到 {len(items)} 个项目")
        
        # 删除
        await store.adelete(namespace, key)
        print(f"✅ 删除成功")
        
        print("\n所有测试通过！")
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await AgentFactory.shutdown()


if __name__ == "__main__":
    asyncio.run(test_store_init())
