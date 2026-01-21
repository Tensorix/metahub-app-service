"""
测试 Message 同步功能

运行方式：
python test_message_sync.py
"""

import requests
import json
from datetime import datetime

# 配置
BASE_URL = "http://localhost:8000"
USERNAME = "testuser"
PASSWORD = "testpass123"

def get_token():
    """获取认证 token"""
    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={
            "username": USERNAME,
            "password": PASSWORD
        }
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"登录失败: {response.text}")
        return None

def test_message_sync():
    """测试 Message 同步功能"""
    token = get_token()
    if not token:
        print("无法获取 token，测试终止")
        return
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print("=" * 60)
    print("测试 Message 同步功能")
    print("=" * 60)
    
    # 1. 创建一个 Session（用于测试）
    print("\n1. 创建测试 Session...")
    session_response = requests.post(
        f"{BASE_URL}/api/v1/sessions",
        headers=headers,
        json={
            "name": "测试会话",
            "type": "ai"
        }
    )
    
    if session_response.status_code != 201:
        print(f"创建 Session 失败: {session_response.text}")
        return
    
    session_id = session_response.json()["id"]
    print(f"✓ Session 创建成功: {session_id}")
    
    # 2. 测试创建 Message
    print("\n2. 测试创建 Message...")
    sync_request = {
        "messages": [
            {
                "operation": "create",
                "session_id": session_id,
                "role": "user",
                "parts": [
                    {
                        "type": "text",
                        "content": "你好，这是第一条测试消息"
                    }
                ]
            },
            {
                "operation": "create",
                "session_id": session_id,
                "role": "assistant",
                "parts": [
                    {
                        "type": "text",
                        "content": "你好！我是 AI 助手。"
                    }
                ]
            },
            {
                "operation": "create",
                "session_id": session_id,
                "role": "user",
                "parts": [
                    {
                        "type": "text",
                        "content": "请看这段代码："
                    },
                    {
                        "type": "plain",
                        "content": "def hello():\n    print('Hello, World!')",
                        "metadata": {
                            "language": "python"
                        }
                    }
                ]
            }
        ],
        "conflict_strategy": "server_wins"
    }
    
    sync_response = requests.post(
        f"{BASE_URL}/api/v1/sync/batch",
        headers=headers,
        json=sync_request
    )
    
    if sync_response.status_code != 200:
        print(f"✗ 同步失败: {sync_response.text}")
        return
    
    sync_result = sync_response.json()
    print(f"✓ 创建了 {len(sync_result['messages'])} 条消息")
    
    message_ids = []
    for msg_result in sync_result["messages"]:
        if msg_result["success"]:
            message_ids.append(msg_result["id"])
            print(f"  - Message ID: {msg_result['id']}, Version: {msg_result['version']}")
        else:
            print(f"  ✗ 创建失败: {msg_result['error']}")
    
    if not message_ids:
        print("没有成功创建的消息")
        return
    
    # 3. 测试拉取 Message
    print("\n3. 测试拉取 Message...")
    pull_request = {
        "include_activities": False,
        "include_sessions": False,
        "include_topics": False,
        "include_messages": True,
        "limit": 100
    }
    
    pull_response = requests.post(
        f"{BASE_URL}/api/v1/sync/pull",
        headers=headers,
        json=pull_request
    )
    
    if pull_response.status_code != 200:
        print(f"✗ 拉取失败: {pull_response.text}")
        return
    
    pull_result = pull_response.json()
    print(f"✓ 拉取到 {len(pull_result['messages'])} 条消息")
    
    for msg in pull_result["messages"]:
        print(f"  - ID: {msg['id']}, Role: {msg['role']}, Parts: {len(msg['parts'])}, Version: {msg['version']}")
    
    # 4. 测试更新 Message
    print("\n4. 测试更新 Message...")
    if message_ids:
        update_request = {
            "messages": [
                {
                    "operation": "update",
                    "id": message_ids[0],
                    "version": 1,
                    "parts": [
                        {
                            "type": "text",
                            "content": "这是更新后的消息内容"
                        }
                    ]
                }
            ],
            "conflict_strategy": "server_wins"
        }
        
        update_response = requests.post(
            f"{BASE_URL}/api/v1/sync/batch",
            headers=headers,
            json=update_request
        )
        
        if update_response.status_code == 200:
            update_result = update_response.json()
            msg_result = update_result["messages"][0]
            if msg_result["success"]:
                print(f"✓ 更新成功, 新版本: {msg_result['version']}")
            else:
                print(f"✗ 更新失败: {msg_result['error']}")
        else:
            print(f"✗ 更新请求失败: {update_response.text}")
    
    # 5. 测试删除 Message
    print("\n5. 测试删除 Message...")
    if len(message_ids) > 1:
        delete_request = {
            "messages": [
                {
                    "operation": "delete",
                    "id": message_ids[1],
                    "version": 1
                }
            ],
            "conflict_strategy": "server_wins"
        }
        
        delete_response = requests.post(
            f"{BASE_URL}/api/v1/sync/batch",
            headers=headers,
            json=delete_request
        )
        
        if delete_response.status_code == 200:
            delete_result = delete_response.json()
            msg_result = delete_result["messages"][0]
            if msg_result["success"]:
                print(f"✓ 删除成功")
            else:
                print(f"✗ 删除失败: {msg_result['error']}")
        else:
            print(f"✗ 删除请求失败: {delete_response.text}")
    
    # 6. 测试版本冲突
    print("\n6. 测试版本冲突...")
    if message_ids:
        conflict_request = {
            "messages": [
                {
                    "operation": "update",
                    "id": message_ids[0],
                    "version": 1,  # 使用旧版本号
                    "parts": [
                        {
                            "type": "text",
                            "content": "尝试用旧版本更新"
                        }
                    ]
                }
            ],
            "conflict_strategy": "fail"
        }
        
        conflict_response = requests.post(
            f"{BASE_URL}/api/v1/sync/batch",
            headers=headers,
            json=conflict_request
        )
        
        if conflict_response.status_code == 200:
            conflict_result = conflict_response.json()
            msg_result = conflict_result["messages"][0]
            if msg_result["conflict"]:
                print(f"✓ 正确检测到版本冲突")
                print(f"  错误信息: {msg_result['error']}")
            else:
                print(f"✗ 未检测到冲突（预期应该有冲突）")
        else:
            print(f"✗ 冲突测试请求失败: {conflict_response.text}")
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)

if __name__ == "__main__":
    test_message_sync()
