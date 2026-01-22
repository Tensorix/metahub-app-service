"""测试 IM 消息 Webhook 功能"""
import requests
import json
from datetime import datetime

# 配置
BASE_URL = "http://localhost:8000"
API_KEY = "sk-your-api-key-here"  # 替换为你的 API Key

# 测试数据 - 重要消息（包含任务）- 来自 QQ
important_message = {
    "timestamp": int(datetime.now().timestamp()),
    "group": None,
    "self_id": "testbot",
    "sender": {
        "user_id": "user123",
        "nickname": "张三"
    },
    "session_type": "pm",  # 私聊
    "source": "astr_qq",   # 来自 Astrbot QQ 插件
    "session_id": "test_session_001",
    "message_id": "msg_001",
    "message": [
        {
            "type": "text",
            "text": "请你明天下午3点前完成项目报告，这个很紧急！"
        }
    ],
    "message_str": "请你明天下午3点前完成项目报告，这个很紧急！",
    "raw_message": {}
}

# 测试数据 - 普通消息 - 来自微信
normal_message = {
    "timestamp": int(datetime.now().timestamp()),
    "group": None,
    "self_id": "testbot",
    "sender": {
        "user_id": "user456",
        "nickname": "李四"
    },
    "session_type": "pm",
    "source": "astr_wechat",  # 来自 Astrbot 微信插件
    "session_id": "test_session_002",
    "message_id": "msg_002",
    "message": [
        {
            "type": "text",
            "text": "hi，在吗？"
        }
    ],
    "message_str": "hi，在吗？",
    "raw_message": {}
}

# 测试数据 - 群消息 - 来自 Telegram
group_message = {
    "timestamp": int(datetime.now().timestamp()),
    "group": {
        "group_id": "group_001",
        "group_name": "项目讨论组"
    },
    "self_id": "testbot",
    "sender": {
        "user_id": "user789",
        "nickname": "王五"
    },
    "session_type": "group",
    "source": "astr_telegram",  # 来自 Astrbot Telegram 插件
    "session_id": "group_001",
    "message_id": "msg_003",
    "message": [
        {
            "type": "at",
            "user_id": "testbot",
            "name": "testbot"
        },
        {
            "type": "text",
            "text": " 周五下午2点开会讨论新功能"
        }
    ],
    "message_str": "@testbot 周五下午2点开会讨论新功能",
    "raw_message": {}
}


def test_webhook(message_data, description):
    """测试 webhook 接口"""
    print(f"\n{'='*60}")
    print(f"测试: {description}")
    print(f"{'='*60}")
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/webhooks/im/message",
            headers=headers,
            json=message_data,
            timeout=10
        )
        
        print(f"状态码: {response.status_code}")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        
        if response.status_code == 202:
            print("✅ 消息已接收，正在后台处理")
        else:
            print(f"❌ 请求失败: {response.text}")
            
    except Exception as e:
        print(f"❌ 请求异常: {e}")


if __name__ == "__main__":
    print("IM 消息 Webhook 测试")
    print(f"API 端点: {BASE_URL}/api/v1/webhooks/im/message")
    print(f"认证方式: API Key")
    print("\n注意：")
    print("- session_type 和 source 字段由上游系统定义，不做映射")
    print("- message part type 支持: text/image/at/url/json")
    
    # 测试重要消息
    test_webhook(important_message, "重要消息 (QQ) - 包含任务和截止时间")
    
    # 等待一下
    import time
    time.sleep(2)
    
    # 测试普通消息
    test_webhook(normal_message, "普通消息 (微信) - 日常问候")
    
    # 等待一下
    time.sleep(2)
    
    # 测试群消息
    test_webhook(group_message, "群消息 (Telegram) - 会议通知")
    
    print(f"\n{'='*60}")
    print("测试完成！")
    print("请检查后台日志查看处理结果")
    print("可以通过以下接口查看创建的数据：")
    print(f"  - Sessions: GET {BASE_URL}/api/v1/sessions")
    print(f"  - Events: GET {BASE_URL}/api/v1/experimental/events")
    print(f"  - Activities: GET {BASE_URL}/api/v1/activities")
    print(f"{'='*60}\n")
