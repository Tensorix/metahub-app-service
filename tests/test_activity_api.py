#!/usr/bin/env python3
"""
Activity API 测试脚本
运行前请确保：
1. 数据库已启动并配置正确
2. 已运行 alembic upgrade head 应用数据库迁移
3. 服务已启动在 http://localhost:8000
"""

import requests
import json
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000/api/v1/activities"

def test_create_activity():
    """测试创建活动"""
    print("=== 测试创建活动 ===")
    
    activity_data = {
        "type": "meeting",
        "name": "团队周会",
        "priority": 5,
        "comments": "讨论本周工作进展和下周计划",
        "tags": ["会议", "团队", "周会"],
        "reminder_time": (datetime.now() + timedelta(hours=1)).isoformat(),
        "due_date": (datetime.now() + timedelta(days=1)).isoformat()
    }
    
    response = requests.post(BASE_URL, json=activity_data)
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    if response.status_code == 200:
        return response.json()["data"]["id"]
    return None

def test_get_activity(activity_id):
    """测试获取活动详情"""
    print(f"\n=== 测试获取活动详情 (ID: {activity_id}) ===")
    
    response = requests.get(f"{BASE_URL}/{activity_id}")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

def test_get_activities():
    """测试获取活动列表"""
    print("\n=== 测试获取活动列表 ===")
    
    params = {
        "page": 1,
        "size": 10,
        "type": "meeting"
    }
    
    response = requests.get(BASE_URL, params=params)
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

def test_update_activity(activity_id):
    """测试更新活动"""
    print(f"\n=== 测试更新活动 (ID: {activity_id}) ===")
    
    update_data = {
        "name": "团队周会（已更新）",
        "priority": 8,
        "comments": "更新：增加项目进度汇报环节"
    }
    
    response = requests.put(f"{BASE_URL}/{activity_id}", json=update_data)
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

def test_delete_activity(activity_id):
    """测试删除活动"""
    print(f"\n=== 测试软删除活动 (ID: {activity_id}) ===")
    
    response = requests.delete(f"{BASE_URL}/{activity_id}")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

def test_restore_activity(activity_id):
    """测试恢复活动"""
    print(f"\n=== 测试恢复活动 (ID: {activity_id}) ===")
    
    response = requests.post(f"{BASE_URL}/{activity_id}/restore")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

if __name__ == "__main__":
    print("开始测试 Activity API...")
    
    # 创建活动
    activity_id = test_create_activity()
    
    if activity_id:
        # 获取活动详情
        test_get_activity(activity_id)
        
        # 获取活动列表
        test_get_activities()
        
        # 更新活动
        test_update_activity(activity_id)
        
        # 删除活动
        test_delete_activity(activity_id)
        
        # 恢复活动
        test_restore_activity(activity_id)
        
        print("\n测试完成！")
    else:
        print("创建活动失败，跳过后续测试")