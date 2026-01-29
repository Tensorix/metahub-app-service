"""
IM Gateway WebSocket 测试脚本

测试场景:
1. 建立 WebSocket 连接
2. 发送心跳 ping/pong
3. 模拟转发 IM 消息到服务端
4. 模拟接收服务端的发送消息指令并回报结果
5. 查询网关状态
"""
import asyncio
import json
from datetime import datetime
import websockets
import httpx


# 配置
API_BASE = "http://localhost:8000/api/v1"
WS_BASE = "ws://localhost:8000/api/v1"
USERNAME = "test_user"
PASSWORD = "test_password"


async def get_access_token() -> str:
    """获取 JWT token"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE}/auth/login",
            json={"username": USERNAME, "password": PASSWORD}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        else:
            raise Exception(f"Login failed: {response.text}")


async def test_websocket_connection(token: str):
    """测试 WebSocket 连接和基本通信"""
    print("\n=== 测试 WebSocket 连接 ===")
    
    url = f"{WS_BASE}/im/gateway?token={token}&source=test_bot"
    
    async with websockets.connect(url) as ws:
        print("✓ WebSocket 连接成功")
        
        # 测试心跳
        print("\n--- 测试心跳 ---")
        await ws.send(json.dumps({"type": "ping"}))
        response = await ws.recv()
        data = json.loads(response)
        assert data["type"] == "pong", "心跳响应错误"
        print("✓ 心跳测试通过")
        
        # 测试转发 IM 消息
        print("\n--- 测试转发 IM 消息 ---")
        im_message = {
            "type": "message",
            "data": {
                "timestamp": int(datetime.now().timestamp()),
                "session_id": "test_group_001",
                "message_id": f"msg_{int(datetime.now().timestamp())}",
                "session_type": "group",
                "source": "test_bot",
                "sender": {
                    "nickname": "测试用户",
                    "user_id": "user_001"
                },
                "self_id": "bot_001",
                "message_str": "这是一条测试消息",
                "message": [
                    {"type": "text", "text": "这是一条测试消息"}
                ],
                "group": {
                    "group_id": "001",
                    "group_name": "测试群"
                }
            }
        }
        await ws.send(json.dumps(im_message))
        print("✓ IM 消息已发送到服务端")
        
        # 等待可能的服务端响应
        await asyncio.sleep(1)
        
        # 测试接收发送消息指令（需要手动触发或模拟）
        print("\n--- 等待服务端发送消息指令 (5秒超时) ---")
        try:
            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(response)
            if data.get("type") == "send_message":
                print(f"✓ 收到发送消息指令: {data}")
                # 回报结果
                result = {
                    "type": "result",
                    "request_id": data["request_id"],
                    "success": True,
                    "data": {"message_id": "platform_msg_123"}
                }
                await ws.send(json.dumps(result))
                print("✓ 已回报发送结果")
        except asyncio.TimeoutError:
            print("⚠ 未收到发送消息指令（正常，需要手动触发）")


async def test_gateway_status(token: str):
    """测试网关状态查询"""
    print("\n=== 测试网关状态查询 ===")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{API_BASE}/im/gateway/status",
            headers={"Authorization": f"Bearer {token}"}
        )
        if response.status_code == 200:
            status = response.json()
            print(f"✓ 活跃连接数: {len(status['active_connections'])}")
            for conn in status['active_connections']:
                print(f"  - user_id: {conn['user_id']}, source: {conn['source']}")
        else:
            print(f"✗ 状态查询失败: {response.text}")


async def test_send_message_api(token: str, session_id: str):
    """测试发送消息 REST API"""
    print("\n=== 测试发送消息 API ===")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE}/sessions/{session_id}/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "message": [{"type": "text", "text": "测试回复消息"}],
                "message_str": "测试回复消息"
            }
        )
        if response.status_code == 200:
            result = response.json()
            print(f"✓ 消息发送成功: {result}")
        elif response.status_code == 503:
            print("⚠ 桥接未连接（需要先建立 WebSocket 连接）")
        elif response.status_code == 404:
            print("⚠ Session 不存在（需要先创建 Session）")
        else:
            print(f"✗ 发送失败: {response.text}")


async def main():
    """主测试流程"""
    print("IM Gateway WebSocket 测试")
    print("=" * 50)
    
    try:
        # 1. 获取 token
        print("\n--- 获取访问令牌 ---")
        token = await get_access_token()
        print("✓ Token 获取成功")
        
        # 2. 测试 WebSocket 连接
        await test_websocket_connection(token)
        
        # 3. 测试网关状态
        await test_gateway_status(token)
        
        # 4. 测试发送消息 API（需要提供有效的 session_id）
        # 取消注释以测试，需要替换为实际的 session_id
        # await test_send_message_api(token, "your-session-id-here")
        
        print("\n" + "=" * 50)
        print("✓ 所有测试完成")
        
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
