"""
Test Agent Management API
"""

import asyncio
import httpx
from uuid import UUID

BASE_URL = "http://localhost:8000"


async def test_agent_api():
    """Test agent CRUD operations."""
    
    # 1. Register/Login
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # Try to login first
        login_data = {
            "username": "testuser",
            "password": "testpass123"
        }
        
        response = await client.post("/api/v1/auth/login", json=login_data)
        
        if response.status_code != 200:
            # Register if login fails
            register_data = {
                "username": "testuser",
                "password": "testpass123",
                "email": "test@example.com"
            }
            response = await client.post("/api/v1/auth/register", json=register_data)
            print(f"Register: {response.status_code}")
            
            # Login again
            response = await client.post("/api/v1/auth/login", json=login_data)
        
        token_data = response.json()
        token = token_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        print(f"✓ Logged in successfully")
        
        # 2. Create Agent
        agent_data = {
            "name": "Test Agent",
            "system_prompt": "You are a helpful assistant.",
            "model": "gpt-4o-mini",
            "model_provider": "openai",
            "temperature": 0.7,
            "max_tokens": 4096,
            "tools": ["calculator", "search"]
        }
        
        response = await client.post("/api/v1/agents", json=agent_data, headers=headers)
        assert response.status_code == 201, f"Create failed: {response.text}"
        agent = response.json()
        agent_id = agent["id"]
        print(f"✓ Created agent: {agent['name']} (ID: {agent_id})")
        
        # 3. List Agents
        response = await client.get("/api/v1/agents", headers=headers)
        assert response.status_code == 200
        agents_list = response.json()
        print(f"✓ Listed agents: {agents_list['total']} total")
        
        # 4. Get Agent
        response = await client.get(f"/api/v1/agents/{agent_id}", headers=headers)
        assert response.status_code == 200
        agent = response.json()
        print(f"✓ Got agent: {agent['name']}")
        
        # 5. Update Agent
        update_data = {
            "name": "Updated Test Agent",
            "temperature": 0.8
        }
        response = await client.put(f"/api/v1/agents/{agent_id}", json=update_data, headers=headers)
        assert response.status_code == 200
        updated_agent = response.json()
        print(f"✓ Updated agent: {updated_agent['name']}, temp={updated_agent['temperature']}")
        
        # 6. Create Session with Agent
        session_data = {
            "name": "Test Session with Agent",
            "type": "ai",
            "agent_id": agent_id
        }
        response = await client.post("/api/v1/sessions", json=session_data, headers=headers)
        assert response.status_code == 201
        session = response.json()
        print(f"✓ Created session with agent: {session['name']} (agent_id: {session.get('agent_id')})")
        
        # 7. Search Agents
        response = await client.get("/api/v1/agents?search=Updated", headers=headers)
        assert response.status_code == 200
        search_results = response.json()
        print(f"✓ Searched agents: found {search_results['total']} results")
        
        # 8. Delete Agent
        response = await client.delete(f"/api/v1/agents/{agent_id}", headers=headers)
        assert response.status_code == 204
        print(f"✓ Deleted agent")
        
        # 9. Verify deletion
        response = await client.get(f"/api/v1/agents/{agent_id}", headers=headers)
        assert response.status_code == 404
        print(f"✓ Verified agent is deleted")
        
        print("\n✅ All tests passed!")


if __name__ == "__main__":
    asyncio.run(test_agent_api())
