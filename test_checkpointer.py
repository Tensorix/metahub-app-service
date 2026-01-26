"""
Test checkpointer initialization
"""
import asyncio
from app.agent.factory import AgentFactory


async def test_checkpointer():
    """Test checkpointer"""
    
    print("=== Testing Checkpointer ===")
    
    try:
        checkpointer = await AgentFactory.get_checkpointer()
        print("✓ Checkpointer created successfully")
        print(f"  Type: {type(checkpointer)}")
        print(f"  Connection pool: {AgentFactory._connection_pool}")
        
    except Exception as e:
        print(f"✗ Error creating checkpointer: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_checkpointer())
