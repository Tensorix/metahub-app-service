"""
测试 sender 信息在 API 响应中正确返回
"""
import requests
import json

# 配置
BASE_URL = "http://localhost:8000"
USERNAME = "test_user"
PASSWORD = "test_password"

def test_sender_in_message_response():
    """测试消息响应中包含 sender 信息"""
    
    # 1. 登录获取 token
    print("1. 登录...")
    login_response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={
            "username": USERNAME,
            "password": PASSWORD,
            "client_type": "web"
        }
    )
    
    if login_response.status_code != 200:
        print(f"❌ 登录失败: {login_response.text}")
        return
    
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("✅ 登录成功")
    
    # 2. 获取会话列表
    print("\n2. 获取会话列表...")
    sessions_response = requests.get(
        f"{BASE_URL}/api/v1/sessions",
        headers=headers,
        params={"page": 1, "size": 10}
    )
    
    if sessions_response.status_code != 200:
        print(f"❌ 获取会话失败: {sessions_response.text}")
        return
    
    sessions = sessions_response.json()["items"]
    if not sessions:
        print("❌ 没有找到会话")
        return
    
    print(f"✅ 找到 {len(sessions)} 个会话")
    
    # 3. 获取第一个会话的消息
    session_id = sessions[0]["id"]
    session_name = sessions[0].get("name", "未命名")
    print(f"\n3. 获取会话 '{session_name}' 的消息...")
    
    messages_response = requests.get(
        f"{BASE_URL}/api/v1/sessions/{session_id}/messages",
        headers=headers,
        params={"page": 1, "size": 20}
    )
    
    if messages_response.status_code != 200:
        print(f"❌ 获取消息失败: {messages_response.text}")
        return
    
    messages = messages_response.json()["items"]
    print(f"✅ 找到 {len(messages)} 条消息")
    
    # 4. 检查消息中的 sender 信息
    print("\n4. 检查 sender 信息...")
    messages_with_sender = 0
    messages_without_sender = 0
    
    for i, msg in enumerate(messages[:5], 1):  # 只检查前5条
        print(f"\n--- 消息 {i} ---")
        print(f"ID: {msg['id']}")
        print(f"Role: {msg['role']}")
        print(f"Sender ID: {msg.get('sender_id', 'None')}")
        
        if msg.get("sender"):
            messages_with_sender += 1
            sender = msg["sender"]
            print(f"✅ Sender 信息:")
            print(f"   - ID: {sender['id']}")
            print(f"   - Name: {sender['name']}")
            print(f"   - External ID: {sender.get('external_id', 'None')}")
        else:
            messages_without_sender += 1
            print(f"⚠️  没有 sender 信息")
        
        # 显示消息内容（前100字符）
        if msg.get("parts"):
            content = msg["parts"][0].get("content", "")[:100]
            print(f"内容: {content}...")
    
    print("\n" + "="*60)
    print(f"总结:")
    print(f"  - 有 sender 信息的消息: {messages_with_sender}")
    print(f"  - 没有 sender 信息的消息: {messages_without_sender}")
    
    if messages_with_sender > 0:
        print("\n✅ 测试通过！API 正确返回了 sender 信息")
    else:
        print("\n⚠️  警告：没有找到包含 sender 信息的消息")
        print("   这可能是因为：")
        print("   1. 消息没有关联 sender_id")
        print("   2. 需要重新导入数据")


if __name__ == "__main__":
    try:
        test_sender_in_message_response()
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
