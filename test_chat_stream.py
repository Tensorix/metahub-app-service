"""
Test script for chat streaming endpoint
"""
import asyncio
import httpx
import json


async def test_chat_stream():
    """Test the chat streaming endpoint"""
    
    # First, login to get token
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # # Login
        # login_response = await client.post(
        #     "/api/v1/auth/login",
        #     json={"username": "admin", "password": "admin123"}
        # )
        
        # if login_response.status_code != 200:
        #     print(f"Login failed: {login_response.status_code}")
        #     print(login_response.text)
        #     return
        
        # token_data = login_response.json()
        # access_token = token_data["access_token"]
        access_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTliZDQ1MS01ZmZmLTc0NDUtYTY3MC1iNzJhNzYzM2U2OGYiLCJ1c2VybmFtZSI6Im5vYWgiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzY5OTQwODA5LCJpYXQiOjE3Njk5MzkwMDl9._s5NZ83ogQZmlXIaCFI52cXXCqBmkkH4rW4uBdfUjLI"
        print(f"✓ Logged in successfully")
        
        # Get or create a session
        sessions_response = await client.get(
            "/api/v1/sessions",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if sessions_response.status_code != 200:
            print(f"Failed to get sessions: {sessions_response.status_code}")
            return
        
        sessions = sessions_response.json()["items"]
        
        # Find an AI session or use the provided one
        session_id = "019bf86d-2a11-77da-8874-f1b291f976f8"
        print(f"✓ Using session: {session_id}")
        
        # Test streaming chat
        print("\n=== Testing Streaming Chat ===")
        
        async with client.stream(
            "POST",
            f"/api/v1/sessions/{session_id}/chat",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "text/event-stream",
            },
            json={
                "message": "Say hello in one sentence",
                "stream": True,
            },
            timeout=30.0,
        ) as response:
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                print(f"Error: {await response.aread()}")
                return
            
            print("\n=== Streaming Events ===")
            buffer = ""
            event_count = 0
            chunk_count = 0
            
            async for chunk in response.aiter_bytes():
                chunk_count += 1
                chunk_str = chunk.decode('utf-8')
                if chunk_count <= 5:
                    print(f"Chunk #{chunk_count}: {repr(chunk_str[:200])}")
                buffer += chunk_str
                
                # Parse SSE events - handle both \r\n\r\n and \n\n
                separator = '\r\n\r\n' if '\r\n' in buffer else '\n\n'
                while separator in buffer:
                    event_text, buffer = buffer.split(separator, 1)
                    
                    lines = event_text.strip().split('\r\n' if '\r\n' in event_text else '\n')
                    event_type = None
                    event_data = None
                    
                    for line in lines:
                        if line.startswith('event:'):
                            event_type = line[6:].strip()
                        elif line.startswith('data:'):
                            event_data = line[5:].strip()
                    
                    if event_type and event_data:
                        event_count += 1
                        try:
                            data = json.loads(event_data)
                            print(f"Event #{event_count}: {event_type}")
                            if event_type == "message":
                                print(f"  Content: {data.get('content', '')}")
                            elif event_type == "error":
                                print(f"  Error: {data.get('error', '')}")
                            elif event_type == "done":
                                print(f"  Status: {data.get('status', '')}")
                        except json.JSONDecodeError:
                            print(f"Failed to parse: {event_data}")
            
            print(f"\n✓ Received {event_count} events from {chunk_count} chunks")


if __name__ == "__main__":
    asyncio.run(test_chat_stream())
