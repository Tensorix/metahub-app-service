"""
Direct test of agent streaming without HTTP layer
"""
import asyncio
from app.agent.deep_agent_service import DeepAgentService
from app.config import config


async def test_agent_stream():
    """Test agent streaming directly"""
    
    print("=== Testing Agent Stream Directly ===")
    print(f"OpenAI API Key: {config.OPENAI_API_KEY[:20]}...")
    print(f"OpenAI Base URL: {config.OPENAI_BASE_URL}")
    
    # Create agent service
    agent_config = {
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "system_prompt": "You are a helpful assistant.",
        "tools": [],
    }
    
    agent_service = DeepAgentService(
        agent_config=agent_config,
        checkpointer=None,  # No checkpointer for simple test
        store=None,
    )
    
    print("\n✓ Agent service created")
    
    # Test streaming
    print("\n=== Starting Stream ===")
    
    try:
        event_count = 0
        async for event in agent_service.chat_stream(
            message="Say hello in one sentence",
            thread_id="test-thread",
            user_id=None,
        ):
            event_count += 1
            event_type = event.get("event")
            event_data = event.get("data", {})
            
            print(f"Event #{event_count}: {event_type}")
            
            if event_type == "message":
                print(f"  Content: {event_data.get('content', '')}")
            elif event_type == "error":
                print(f"  Error: {event_data.get('error', '')}")
            elif event_type == "done":
                print(f"  Status: {event_data.get('status', '')}")
        
        print(f"\n✓ Stream completed with {event_count} events")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_agent_stream())
