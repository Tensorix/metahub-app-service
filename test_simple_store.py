"""简单测试 Store"""

import asyncio
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from langgraph.store.postgres import AsyncPostgresStore


async def test():
    print("1. 创建连接池...")
    pool = AsyncConnectionPool(
        conninfo="postgresql://postgres:postgres@localhost:5432/metahub",
        min_size=1,
        max_size=2,
        open=False,
        kwargs={"autocommit": True, "row_factory": dict_row}
    )
    
    print("2. 打开连接池...")
    await pool.open()
    
    print("3. 创建 Store...")
    store = AsyncPostgresStore(pool)
    
    print("4. Setup Store...")
    await store.setup()
    
    print("5. 测试写入...")
    await store.aput(("test", "fs"), "/test.txt", {"content": "hello"})
    
    print("6. 测试读取...")
    item = await store.aget(("test", "fs"), "/test.txt")
    print(f"   读取结果: {item.value if item else None}")
    
    print("7. 关闭...")
    await pool.close()
    
    print("✅ 完成！")


if __name__ == "__main__":
    asyncio.run(test())
