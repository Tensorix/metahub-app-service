#!/usr/bin/env python3
"""
测试 Ping Event 自动创建 Activity 功能
运行前请确保：
1. 数据库已启动并配置正确
2. 已运行 alembic upgrade head 应用数据库迁移
3. 服务已启动在 http://localhost:8000
"""

import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_ping_event_creates_activity():
    """测试创建 ping event 时自动创建 activity"""
    print("=== 测试 Ping Event 自动创建 Activity ===")
    
    # 测试数据 1: 包含 name 字段
    ping_data_1 = {
        "name": "系统健康检查",
        "source": "monitoring_system",
        "timestamp": "2026-01-07T16:48:55Z"
    }
    
    print(f"发送 ping event: {json.dumps(ping_data_1, indent=2, ensure_ascii=False)}")
    response = requests.post(f"{BASE_URL}/events/ping", json=ping_data_1)
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    if response.status_code == 200:
        result = response.json()
        event_id = result["event"]["id"]
        activity_id = result["activity"]["id"]
        
        # 验证创建的 activity
        print(f"\n验证创建的 Activity (ID: {activity_id}):")
        activity_response = requests.get(f"{BASE_URL}/activities/{activity_id}")
        print(f"Activity 详情: {json.dumps(activity_response.json(), indent=2, ensure_ascii=False)}")
        
        # 验证 activity 列表中包含 ping 类型的记录
        print(f"\n查询 ping 类型的 activities:")
        list_response = requests.get(f"{BASE_URL}/activities?type=ping")
        print(f"Ping Activities: {json.dumps(list_response.json(), indent=2, ensure_ascii=False)}")
    
    print("\n" + "="*50)
    
    # 测试数据 2: 不包含 name 字段
    ping_data_2 = {
        "source": "api_gateway",
        "status": "ok",
        "response_time": 150
    }
    
    print(f"发送 ping event (无 name): {json.dumps(ping_data_2, indent=2, ensure_ascii=False)}")
    response = requests.post(f"{BASE_URL}/events/ping", json=ping_data_2)
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

def test_activity_event_relationship():
    """测试 activity 和 event 的关联关系"""
    print("\n=== 测试 Activity 和 Event 关联关系 ===")
    
    # 获取所有 events
    events_response = requests.get(f"{BASE_URL}/events")
    print(f"所有 Events: {json.dumps(events_response.json(), indent=2, ensure_ascii=False)}")
    
    # 获取所有 activities
    activities_response = requests.get(f"{BASE_URL}/activities")
    print(f"所有 Activities: {json.dumps(activities_response.json(), indent=2, ensure_ascii=False)}")

if __name__ == "__main__":
    print("开始测试 Ping Event 自动创建 Activity 功能...")
    
    # 测试 ping event 创建 activity
    test_ping_event_creates_activity()
    
    # 测试关联关系
    test_activity_event_relationship()
    
    print("\n测试完成！")