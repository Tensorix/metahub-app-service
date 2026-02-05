#!/usr/bin/env python3
"""
测试活动管理前端功能
"""
import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000/api/v1"

def login():
    """登录获取 token"""
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "username": "admin",
            "password": "admin123"
        }
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    else:
        print(f"登录失败: {response.text}")
        return None

def test_create_activity(token):
    """测试创建活动"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # 创建一个测试活动
    activity_data = {
        "type": "meeting",
        "name": "团队周会",
        "priority": 8,
        "comments": "讨论本周工作进展和下周计划",
        "tags": ["会议", "团队", "周会"],
        "status": "pending",
        "remind_at": (datetime.now() + timedelta(hours=1)).isoformat(),
        "due_date": (datetime.now() + timedelta(days=1)).isoformat()
    }
    
    response = requests.post(
        f"{BASE_URL}/activities",
        headers=headers,
        json=activity_data
    )
    
    print(f"\n创建活动:")
    print(f"状态码: {response.status_code}")
    if response.status_code == 201:
        data = response.json()
        print(f"活动ID: {data['id']}")
        print(f"活动名称: {data['name']}")
        return data['id']
    else:
        print(f"错误: {response.text}")
        return None

def test_get_activities(token):
    """测试获取活动列表"""
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{BASE_URL}/activities",
        headers=headers,
        params={
            "page": 1,
            "size": 10
        }
    )
    
    print(f"\n获取活动列表:")
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"总数: {data['total']}")
        print(f"当前页: {data['page']}")
        print(f"活动数量: {len(data['items'])}")
        for activity in data['items']:
            print(f"  - {activity['name']} (优先级: {activity['priority']}, 状态: {activity['status']})")
    else:
        print(f"错误: {response.text}")

def test_update_activity(token, activity_id):
    """测试更新活动"""
    headers = {"Authorization": f"Bearer {token}"}
    
    update_data = {
        "name": "团队周会（已更新）",
        "priority": 9,
        "status": "active"
    }
    
    response = requests.put(
        f"{BASE_URL}/activities/{activity_id}",
        headers=headers,
        json=update_data
    )
    
    print(f"\n更新活动:")
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"活动名称: {data['name']}")
        print(f"优先级: {data['priority']}")
        print(f"状态: {data['status']}")
    else:
        print(f"错误: {response.text}")

def test_filter_activities(token):
    """测试筛选活动"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # 按类型筛选
    response = requests.get(
        f"{BASE_URL}/activities",
        headers=headers,
        params={
            "page": 1,
            "size": 10,
            "type": "meeting",
            "priority_min": 5
        }
    )
    
    print(f"\n筛选活动 (类型=meeting, 优先级>=5):")
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"符合条件的活动数: {data['total']}")
        for activity in data['items']:
            print(f"  - {activity['name']} (类型: {activity['type']}, 优先级: {activity['priority']})")
    else:
        print(f"错误: {response.text}")

def test_delete_and_restore(token, activity_id):
    """测试删除和恢复活动"""
    headers = {"Authorization": f"Bearer {token}"}
    
    # 软删除
    response = requests.delete(
        f"{BASE_URL}/activities/{activity_id}",
        headers=headers
    )
    
    print(f"\n删除活动:")
    print(f"状态码: {response.status_code}")
    
    # 恢复
    response = requests.post(
        f"{BASE_URL}/activities/{activity_id}/restore",
        headers=headers
    )
    
    print(f"\n恢复活动:")
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"活动已恢复: {data['name']}")
        print(f"is_deleted: {data['is_deleted']}")
    else:
        print(f"错误: {response.text}")

def main():
    print("=" * 60)
    print("活动管理前端功能测试")
    print("=" * 60)
    
    # 登录
    token = login()
    if not token:
        print("无法获取 token，测试终止")
        return
    
    print(f"\n✓ 登录成功，Token: {token[:20]}...")
    
    # 创建活动
    activity_id = test_create_activity(token)
    if not activity_id:
        print("创建活动失败，测试终止")
        return
    
    # 获取活动列表
    test_get_activities(token)
    
    # 更新活动
    test_update_activity(token, activity_id)
    
    # 筛选活动
    test_filter_activities(token)
    
    # 删除和恢复
    test_delete_and_restore(token, activity_id)
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()
