"""
Test LangGraph streaming directly
"""
import asyncio
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent
from app.config import config


async def test_langgraph_stream():
    """Test LangGraph streaming"""
    
    print("=== Testing LangGraph Stream ===")
    
    # Create LLM
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL,
        streaming=True,
    )
    
    print("✓ LLM created")
    
    # Create agent without checkpointer
    agent = create_react_agent(
        model=llm,
        tools=[],
        checkpointer=None,
    )
    
    print("✓ Agent created")
    
    # Test astream_events
    print("\n=== Testing astream_events ===")
    
    try:
        event_count = 0
        async for event in agent.astream_events(
            {"messages": [HumanMessage(content="Say hello in one sentence")]},
            config={"configurable": {"thread_id": "test"}},
            version="v2",
        ):
            event_count += 1
            event_type = event.get("event")
            
            if event_count <= 5 or event_type == "on_chat_model_stream":
                print(f"Event #{event_count}: {event_type}")
            
            if event_type == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    print(f"  Content: {chunk.content}")
        
        print(f"\n✓ Received {event_count} events")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_langgraph_stream())
