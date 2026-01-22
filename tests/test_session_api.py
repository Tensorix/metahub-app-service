#!/usr/bin/env python3
"""
Session API 测试脚本
测试 Session、Topic、Message、Agent 相关功能
运行前请确保：
1. 数据库已启动并配置正确
2. 已运行 alembic upgrade head 应用数据库迁移
3. 服务已启动在 http://localhost:8000
"""

import requests
import json
from datetime import datetime
from uuid import uuid4

BASE_URL = "http://localhost:8000/api/v1"

# 存储测试数据
test_data = {
    "agent_id": None,
    "session_id": None,
    "topic_id": None,
    "message_id": None
}


def print_response(title, response):
    """打印响应信息"""
    print(f"\n{'='*50}")
    print(f"{title}")
    print(f"{'='*50}")
    print(f"状态码: {response.status_code}")
    try:
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    except:
        print(f"响应: {response.text}")


# ============ Agent 测试 ============
def test_create_agent():
    """测试创建 Agent"""
    print_response("测试创建 Agent", requests.post(
        f"{BASE_URL}/agents",
        json={
            "name": "测试助手",
            "system_prompt": "你是一个有用的助手",
            "metadata": {"version": "1.0"}
        }
    ))


def test_get_agents():
    """测试获取 Agent 列表"""
    print_response("测试获取 Agent 列表", requests.get(f"{BASE_URL}/agents"))


def test_get_agent():
    """测试获取 Agent 详情"""
    if test_data["agent_id"]:
        print_response(f"测试获取 Agent 详情", requests.get(f"{BASE_URL}/agents/{test_data['agent_id']}"))


def test_update_agent():
    """测试更新 Agent"""
    if test_data["agent_id"]:
        print_response(f"测试更新 Agent", requests.put(
            f"{BASE_URL}/agents/{test_data['agent_id']}",
            json={
                "name": "测试助手（已更新）",
                "system_prompt": "你是一个更强大的助手"
            }
        ))


def test_delete_agent():
    """测试删除 Agent"""
    if test_data["agent_id"]:
        print_response(f"测试软删除 Agent", requests.delete(f"{BASE_URL}/agents/{test_data['agent_id']}"))


# ============ Session 测试 ============
def test_create_session():
    """测试创建会话"""
    print_response("测试创建会话", requests.post(
        f"{BASE_URL}/sessions",
        json={
            "name": "测试会话",
            "type": "pm",
            "agent_id": test_data["agent_id"],
            "source": "manual_upload",
            "metadata": {"test": True}
        }
    ))


def test_get_sessions():
    """测试获取会话列表"""
    print_response("测试获取会话列表", requests.get(
        f"{BASE_URL}/sessions",
        params={"page": 1, "size": 10, "type": "pm"}
    ))


def test_get_session():
    """测试获取会话详情"""
    if test_data["session_id"]:
        print_response(f"测试获取会话详情", requests.get(f"{BASE_URL}/sessions/{test_data['session_id']}"))


def test_update_session():
    """测试更新会话"""
    if test_data["session_id"]:
        print_response(f"测试更新会话", requests.put(
            f"{BASE_URL}/sessions/{test_data['session_id']}",
            json={
                "name": "测试会话（已更新）",
                "metadata": {"test": True, "updated": True}
            }
        ))


def test_mark_session_read():
    """测试标记会话已读"""
    if test_data["session_id"]:
        print_response(f"测试标记会话已读", requests.post(f"{BASE_URL}/sessions/{test_data['session_id']}/read"))


def test_delete_session():
    """测试删除会话"""
    if test_data["session_id"]:
        print_response(f"测试软删除会话", requests.delete(f"{BASE_URL}/sessions/{test_data['session_id']}"))


# ============ Topic 测试 ============
def test_create_topic():
    """测试创建话题"""
    if test_data["session_id"]:
        print_response("测试创建话题", requests.post(
            f"{BASE_URL}/sessions/{test_data['session_id']}/topics",
            json={
                "name": "测试话题",
                "session_id": test_data["session_id"]
            }
        ))


def test_get_topics():
    """测试获取话题列表"""
    if test_data["session_id"]:
        print_response(f"测试获取话题列表", requests.get(f"{BASE_URL}/sessions/{test_data['session_id']}/topics"))


def test_update_topic():
    """测试更新话题"""
    if test_data["topic_id"]:
        print_response(f"测试更新话题", requests.put(
            f"{BASE_URL}/topics/{test_data['topic_id']}",
            json={"name": "测试话题（已更新）"}
        ))


def test_delete_topic():
    """测试删除话题"""
    if test_data["topic_id"]:
        print_response(f"测试软删除话题", requests.delete(f"{BASE_URL}/topics/{test_data['topic_id']}"))


# ============ Message 测试 ============
def test_create_message():
    """测试发送消息"""
    if test_data["session_id"]:
        print_response("测试发送消息", requests.post(
            f"{BASE_URL}/sessions/{test_data['session_id']}/messages",
            json={
                "session_id": test_data["session_id"],
                "topic_id": test_data["topic_id"],
                "role": "user",
                "sender_id": None,
                "parts": [
                    {
                        "type": "text",
                        "content": "这是一条测试消息"
                    }
                ]
            }
        ))


def test_get_messages():
    """测试获取消息列表"""
    if test_data["session_id"]:
        print_response("测试获取消息列表", requests.get(
            f"{BASE_URL}/sessions/{test_data['session_id']}/messages",
            params={"page": 1, "size": 10}
        ))


def test_delete_message():
    """测试删除消息"""
    if test_data["message_id"]:
        print_response(f"测试软删除消息", requests.delete(f"{BASE_URL}/messages/{test_data['message_id']}"))


# ============ 错误处理测试 ============
def test_error_cases():
    """测试错误处理"""
    print_response("测试：获取不存在的 Agent", requests.get(f"{BASE_URL}/agents/{uuid4()}"))
    print_response("测试：获取不存在的 Session", requests.get(f"{BASE_URL}/sessions/{uuid4()}"))
    print_response("测试：获取不存在的 Topic", requests.get(f"{BASE_URL}/topics/{uuid4()}"))
    print_response("测试：获取不存在的 Message", requests.get(f"{BASE_URL}/messages/{uuid4()}"))
    print_response("测试：创建消息时 session_id 不匹配", requests.post(
        f"{BASE_URL}/sessions/{uuid4()}/messages",
        json={
            "session_id": test_data["session_id"],
            "role": "user",
            "parts": [{"type": "text", "content": "测试"}]
        }
    ))


# ============ 主测试流程 ============
def run_tests():
    """运行完整测试流程"""
    print("\n" + "="*60)
    print("开始测试 Session API...")
    print("="*60)

    # 1. Agent 测试
    print("\n\n# ============ Agent 测试 ============ #")
    test_create_agent()
    response = requests.get(f"{BASE_URL}/agents")
    if response.status_code == 200 and response.json()["data"]:
        test_data["agent_id"] = response.json()["data"][0]["id"]
        print(f"\n✓ Agent ID: {test_data['agent_id']}")
    
    test_get_agents()
    test_get_agent()
    test_update_agent()
    test_get_agent()  # 验证更新

    # 2. Session 测试
    print("\n\n# ============ Session 测试 ============ #")
    test_create_session()
    response = requests.get(f"{BASE_URL}/sessions")
    if response.status_code == 200 and response.json()["data"]["items"]:
        test_data["session_id"] = response.json()["data"]["items"][0]["id"]
        print(f"\n✓ Session ID: {test_data['session_id']}")
    
    test_get_sessions()
    test_get_session()
    test_update_session()
    test_get_session()  # 验证更新
    test_mark_session_read()
    test_get_session()  # 验证已读状态

    # 3. Topic 测试
    print("\n\n# ============ Topic 测试 ============ #")
    test_create_topic()
    response = requests.get(f"{BASE_URL}/sessions/{test_data['session_id']}/topics")
    if response.status_code == 200 and response.json()["data"]:
        test_data["topic_id"] = response.json()["data"][0]["id"]
        print(f"\n✓ Topic ID: {test_data['topic_id']}")
    
    test_get_topics()
    test_update_topic()
    test_get_topics()  # 验证更新

    # 4. Message 测试
    print("\n\n# ============ Message 测试 ============ #")
    test_create_message()
    response = requests.get(f"{BASE_URL}/sessions/{test_data['session_id']}/messages")
    if response.status_code == 200 and response.json()["data"]["items"]:
        test_data["message_id"] = response.json()["data"]["items"][0]["id"]
        print(f"\n✓ Message ID: {test_data['message_id']}")
    
    test_get_messages()
    test_get_messages_with_filter()
    test_delete_message()
    test_get_messages()  # 验证删除

    # 5. 错误处理测试
    print("\n\n# ============ 错误处理测试 ============ #")
    test_error_cases()

    # 6. 清理测试
    print("\n\n# ============ 清理测试 ============ #")
    test_delete_topic()
    test_delete_session()
    test_delete_agent()

    print("\n\n" + "="*60)
    print("✓ 所有测试完成！")
    print("="*60)


def test_get_messages_with_filter():
    """测试带筛选的消息列表"""
    if test_data["session_id"]:
        print_response("测试获取消息列表（按 role 筛选）", requests.get(
            f"{BASE_URL}/sessions/{test_data['session_id']}/messages",
            params={"page": 1, "size": 10, "role": "user"}
        ))


if __name__ == "__main__":
    try:
        run_tests()
    except requests.exceptions.ConnectionError:
        print("\n❌ 错误：无法连接到服务，请确保服务已启动在 http://localhost:8000")
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {str(e)}")
        import traceback
        traceback.print_exc()