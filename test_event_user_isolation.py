#!/usr/bin/env python3
"""
测试 Event 用户隔离功能
运行前请确保：
1. 数据库已启动并配置正确
2. 已运行 alembic upgrade head 应用数据库迁移
3. 服务已启动在 http://localhost:8000
4. 已创建测试用户并获取 token
"""

import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

# 测试用户的 token（需要先创建用户并登录获取）
# 如果在 DEBUG 模式下，可以不需要 token
USER1_TOKEN = None  # 替换为实际的 token
USER2_TOKEN = None  # 替换为实际的 token

def get_headers(token=None):
    """获取请求头"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def test_event_user_isolation():
    """测试 Event 用户隔离功能"""
    print("=== 测试 Event 用户隔离 ===\n")
    
    # 用户1创建 ping event
    print("1. 用户1创建 ping event")
    ping_data_1 = {
        "name": "用户1的健康检查",
        "source": "user1_system",
        "timestamp": "2026-01-21T12:00:00Z"
    }
    
    response1 = requests.post(
        f"{BASE_URL}/events/ping",
        json=ping_data_1,
        headers=get_headers(USER1_TOKEN)
    )
    print(f"状态码: {response1.status_code}")
    if response1.status_code == 200:
        result1 = response1.json()
        event1_id = result1["event"]["id"]
        print(f"创建的 Event ID: {event1_id}")
        print(f"响应: {json.dumps(result1, indent=2, ensure_ascii=False)}\n")
    else:
        print(f"错误: {response1.text}\n")
        return
    
    # 用户2创建 ping event
    print("2. 用户2创建 ping event")
    ping_data_2 = {
        "name": "用户2的健康检查",
        "source": "user2_system",
        "timestamp": "2026-01-21T12:01:00Z"
    }
    
    response2 = requests.post(
        f"{BASE_URL}/events/ping",
        json=ping_data_2,
        headers=get_headers(USER2_TOKEN)
    )
    print(f"状态码: {response2.status_code}")
    if response2.status_code == 200:
        result2 = response2.json()
        event2_id = result2["event"]["id"]
        print(f"创建的 Event ID: {event2_id}")
        print(f"响应: {json.dumps(result2, indent=2, ensure_ascii=False)}\n")
    else:
        print(f"错误: {response2.text}\n")
        return
    
    # 用户1查询自己的 events
    print("3. 用户1查询自己的 events")
    response = requests.get(
        f"{BASE_URL}/events",
        headers=get_headers(USER1_TOKEN)
    )
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        events = response.json()
        print(f"用户1的 Events 数量: {len(events)}")
        print(f"Events: {json.dumps(events, indent=2, ensure_ascii=False)}\n")
        
        # 验证只能看到自己的 event
        event_ids = [e["id"] for e in events]
        if event1_id in event_ids and event2_id not in event_ids:
            print("✓ 用户隔离验证通过：用户1只能看到自己的 events\n")
        else:
            print("✗ 用户隔离验证失败：用户1看到了其他用户的 events\n")
    else:
        print(f"错误: {response.text}\n")
    
    # 用户2查询自己的 events
    print("4. 用户2查询自己的 events")
    response = requests.get(
        f"{BASE_URL}/events",
        headers=get_headers(USER2_TOKEN)
    )
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        events = response.json()
        print(f"用户2的 Events 数量: {len(events)}")
        print(f"Events: {json.dumps(events, indent=2, ensure_ascii=False)}\n")
        
        # 验证只能看到自己的 event
        event_ids = [e["id"] for e in events]
        if event2_id in event_ids and event1_id not in event_ids:
            print("✓ 用户隔离验证通过：用户2只能看到自己的 events\n")
        else:
            print("✗ 用户隔离验证失败：用户2看到了其他用户的 events\n")
    else:
        print(f"错误: {response.text}\n")
    
    # 用户1尝试访问用户2的 event
    print("5. 用户1尝试访问用户2的 event")
    response = requests.get(
        f"{BASE_URL}/events/{event2_id}",
        headers=get_headers(USER1_TOKEN)
    )
    print(f"状态码: {response.status_code}")
    if response.status_code == 404:
        print("✓ 访问控制验证通过：用户1无法访问用户2的 event\n")
    elif response.status_code == 200:
        print("✗ 访问控制验证失败：用户1可以访问用户2的 event\n")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}\n")
    else:
        print(f"错误: {response.text}\n")
    
    # 用户2尝试访问用户1的 event
    print("6. 用户2尝试访问用户1的 event")
    response = requests.get(
        f"{BASE_URL}/events/{event1_id}",
        headers=get_headers(USER2_TOKEN)
    )
    print(f"状态码: {response.status_code}")
    if response.status_code == 404:
        print("✓ 访问控制验证通过：用户2无法访问用户1的 event\n")
    elif response.status_code == 200:
        print("✗ 访问控制验证失败：用户2可以访问用户1的 event\n")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}\n")
    else:
        print(f"错误: {response.text}\n")

def test_debug_mode():
    """测试 DEBUG 模式下的功能（不需要 token）"""
    print("=== 测试 DEBUG 模式 ===\n")
    
    print("1. 创建 ping event（无 token）")
    ping_data = {
        "name": "DEBUG 模式测试",
        "source": "debug_test",
        "timestamp": "2026-01-21T12:00:00Z"
    }
    
    response = requests.post(f"{BASE_URL}/events/ping", json=ping_data)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"响应: {json.dumps(result, indent=2, ensure_ascii=False)}\n")
    else:
        print(f"错误: {response.text}\n")
    
    print("2. 查询 events（无 token）")
    response = requests.get(f"{BASE_URL}/events")
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        events = response.json()
        print(f"Events 数量: {len(events)}")
        print(f"Events: {json.dumps(events, indent=2, ensure_ascii=False)}\n")
    else:
        print(f"错误: {response.text}\n")

if __name__ == "__main__":
    print("开始测试 Event 用户隔离功能...\n")
    
    # 如果没有配置 token，则运行 DEBUG 模式测试
    if not USER1_TOKEN or not USER2_TOKEN:
        print("未配置用户 token，运行 DEBUG 模式测试\n")
        test_debug_mode()
    else:
        test_event_user_isolation()
    
    print("测试完成！")
