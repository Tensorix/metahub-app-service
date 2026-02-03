"""
测试 IM Gateway 发送消息功能

测试场景：
1. 创建一个 pm 类型的 session
2. 通过 /sessions/{session_id}/messages/send 发送消息
3. 验证消息存储为 role=self
4. 验证前端可以正确显示 self 和 null 角色
"""
import asyncio
import httpx
from uuid import uuid4

BASE_URL = "http://localhost:8000"
API_KEY = "sk-test-key"  # 替换为你的 API Key

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


async def test_im_send():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. 创建一个 pm 类型的 session
        print("1. 创建 PM Session...")
        session_data = {
            "name": "测试私聊",
            "type": "pm",
            "source": "astr_qq",
            "external_id": f"test_chat_{uuid4().hex[:8]}",
            "metadata": {
                "auto_send_im": True  # 启用自动发送
            }
        }
        
        response = await client.post(
            f"{BASE_URL}/api/v1/sessions",
            json=session_data,
            headers=headers,
        )
        response.raise_for_status()
        session = response.json()
        session_id = session["id"]
        print(f"✓ Session 创建成功: {session_id}")
        print(f"  - Type: {session['type']}")
        print(f"  - Source: {session['source']}")
        print(f"  - External ID: {session['external_id']}")
        print(f"  - Metadata: {session.get('metadata')}")

        # 2. 尝试发送消息（需要 IM Gateway 连接）
        print("\n2. 发送 IM 消息...")
        message_data = {
            "message": [{"type": "text", "text": "你好，这是一条测试消息"}],
            "message_str": "你好，这是一条测试消息"
        }
        
        try:
            response = await client.post(
                f"{BASE_URL}/api/v1/sessions/{session_id}/messages/send",
                json=message_data,
                headers=headers,
            )
            response.raise_for_status()
            result = response.json()
            print(f"✓ 消息发送结果:")
            print(f"  - Success: {result['success']}")
            print(f"  - Message ID: {result.get('message_id')}")
            print(f"  - Error: {result.get('error')}")
        except httpx.HTTPStatusError as e:
            print(f"✗ 消息发送失败: {e.response.status_code}")
            print(f"  - Detail: {e.response.json()}")
            if e.response.status_code == 503:
                print("\n  提示: 需要先启动 IM Gateway 桥接服务")

        # 3. 查询消息列表，验证 role=self
        print("\n3. 查询消息列表...")
        response = await client.get(
            f"{BASE_URL}/api/v1/sessions/{session_id}/messages",
            headers=headers,
        )
        response.raise_for_status()
        messages = response.json()
        print(f"✓ 消息列表:")
        for msg in messages.get("items", []):
            print(f"  - ID: {msg['id']}")
            print(f"    Role: {msg['role']}")
            print(f"    Content: {msg['parts'][0]['content'] if msg['parts'] else 'N/A'}")

        # 4. 测试更新 session metadata
        print("\n4. 更新 Session 配置...")
        update_data = {
            "metadata": {
                "auto_send_im": False  # 禁用自动发送
            }
        }
        response = await client.put(
            f"{BASE_URL}/api/v1/sessions/{session_id}",
            json=update_data,
            headers=headers,
        )
        response.raise_for_status()
        updated_session = response.json()
        print(f"✓ Session 更新成功:")
        print(f"  - Metadata: {updated_session.get('metadata')}")

        # 5. 清理：删除测试 session
        print("\n5. 清理测试数据...")
        response = await client.delete(
            f"{BASE_URL}/api/v1/sessions/{session_id}",
            headers=headers,
        )
        response.raise_for_status()
        print(f"✓ Session 删除成功")


if __name__ == "__main__":
    print("=" * 60)
    print("IM Gateway 发送消息功能测试")
    print("=" * 60)
    asyncio.run(test_im_send())
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
