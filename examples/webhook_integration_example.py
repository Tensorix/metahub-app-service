"""
IM 消息 Webhook 集成示例

这个示例展示了如何将外部 IM 系统集成到 MetaHub
"""
import requests
from datetime import datetime
from typing import Optional


class MetaHubWebhookClient:
    """MetaHub Webhook 客户端"""
    
    def __init__(self, base_url: str, api_key: str):
        """
        初始化客户端
        
        Args:
            base_url: API 基础 URL，如 http://localhost:8000
            api_key: API Key，以 sk- 开头
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def send_message(
        self,
        session_id: str,
        message_id: str,
        sender_user_id: str,
        sender_nickname: str,
        message_text: str,
        session_type: str = "pm",
        source: str = "custom",
        self_id: str = "bot",
        group_info: Optional[dict] = None,
        timestamp: Optional[int] = None
    ) -> dict:
        """
        发送消息到 MetaHub
        
        Args:
            session_id: 会话ID（外部系统的会话标识）
            message_id: 消息ID（外部系统的消息标识）
            sender_user_id: 发送者用户ID
            sender_nickname: 发送者昵称
            message_text: 消息文本内容
            session_type: 会话类型，如 pm/group/ai 或其他自定义类型
            source: Webhook 来源，如 astr_qq/astr_wechat/astr_telegram 或其他自定义来源
            self_id: 机器人ID
            group_info: 群组信息（群消息时提供）
            timestamp: 消息时间戳（可选，默认当前时间）
        
        Returns:
            API 响应
        """
        if timestamp is None:
            timestamp = int(datetime.now().timestamp())
        
        webhook_data = {
            "timestamp": timestamp,
            "session_id": session_id,
            "message_id": message_id,
            "session_type": session_type,
            "source": source,
            "sender": {
                "user_id": sender_user_id,
                "nickname": sender_nickname
            },
            "self_id": self_id,
            "message_str": message_text,
            "message": [
                {
                    "type": "text",
                    "text": message_text
                }
            ],
            "group": group_info,
            "raw_message": {}
        }
        
        response = requests.post(
            f"{self.base_url}/api/v1/webhooks/im/message",
            headers=self.headers,
            json=webhook_data,
            timeout=10
        )
        
        response.raise_for_status()
        return response.json()
    
    def send_group_message(
        self,
        group_id: str,
        group_name: str,
        message_id: str,
        sender_user_id: str,
        sender_nickname: str,
        message_text: str,
        source: str = "custom",
        self_id: str = "bot"
    ) -> dict:
        """
        发送群消息到 MetaHub
        
        Args:
            group_id: 群组ID
            group_name: 群组名称
            message_id: 消息ID
            sender_user_id: 发送者用户ID
            sender_nickname: 发送者昵称
            message_text: 消息文本内容
            source: Webhook 来源，如 astr_qq/astr_wechat/astr_telegram
            self_id: 机器人ID
        
        Returns:
            API 响应
        """
        group_info = {
            "group_id": group_id,
            "group_name": group_name
        }
        
        return self.send_message(
            session_id=group_id,
            message_id=message_id,
            sender_user_id=sender_user_id,
            sender_nickname=sender_nickname,
            message_text=message_text,
            session_type="group",
            source=source,
            self_id=self_id,
            group_info=group_info
        )


# ============================================================================
# 使用示例
# ============================================================================

def example_basic_usage():
    """基础使用示例"""
    print("=" * 60)
    print("示例 1: 基础使用")
    print("=" * 60)
    
    # 初始化客户端
    client = MetaHubWebhookClient(
        base_url="http://localhost:8000",
        api_key="sk-your-api-key-here"  # 替换为你的 API Key
    )
    
    # 发送私聊消息
    response = client.send_message(
        session_id="user_123",
        message_id="msg_001",
        sender_user_id="user_123",
        sender_nickname="张三",
        message_text="请你明天下午3点前完成项目报告，这个很紧急！"
    )
    
    print(f"响应: {response}")
    print()


def example_group_message():
    """群消息示例"""
    print("=" * 60)
    print("示例 2: 群消息")
    print("=" * 60)
    
    client = MetaHubWebhookClient(
        base_url="http://localhost:8000",
        api_key="sk-your-api-key-here"
    )
    
    # 发送群消息
    response = client.send_group_message(
        group_id="group_001",
        group_name="项目讨论组",
        message_id="msg_002",
        sender_user_id="user_456",
        sender_nickname="李四",
        message_text="周五下午2点开会讨论新功能"
    )
    
    print(f"响应: {response}")
    print()


def example_batch_messages():
    """批量消息示例"""
    print("=" * 60)
    print("示例 3: 批量发送消息")
    print("=" * 60)
    
    client = MetaHubWebhookClient(
        base_url="http://localhost:8000",
        api_key="sk-your-api-key-here"
    )
    
    messages = [
        {
            "session_id": "user_123",
            "message_id": "msg_001",
            "sender_user_id": "user_123",
            "sender_nickname": "张三",
            "message_text": "hi，在吗？"
        },
        {
            "session_id": "user_123",
            "message_id": "msg_002",
            "sender_user_id": "user_123",
            "sender_nickname": "张三",
            "message_text": "请你帮忙看一下这个 bug"
        },
        {
            "session_id": "user_123",
            "message_id": "msg_003",
            "sender_user_id": "user_123",
            "sender_nickname": "张三",
            "message_text": "比较紧急，今天下班前需要修复"
        }
    ]
    
    for msg in messages:
        response = client.send_message(**msg)
        print(f"消息 {msg['message_id']} 已发送: {response['status']}")
    
    print()


def example_error_handling():
    """错误处理示例"""
    print("=" * 60)
    print("示例 4: 错误处理")
    print("=" * 60)
    
    client = MetaHubWebhookClient(
        base_url="http://localhost:8000",
        api_key="sk-invalid-key"  # 无效的 API Key
    )
    
    try:
        response = client.send_message(
            session_id="user_123",
            message_id="msg_001",
            sender_user_id="user_123",
            sender_nickname="张三",
            message_text="测试消息"
        )
        print(f"响应: {response}")
    except requests.exceptions.HTTPError as e:
        print(f"❌ HTTP 错误: {e}")
        print(f"状态码: {e.response.status_code}")
        print(f"响应内容: {e.response.text}")
    except Exception as e:
        print(f"❌ 其他错误: {e}")
    
    print()


# ============================================================================
# 集成到你的 IM 系统
# ============================================================================

class YourIMSystemIntegration:
    """
    你的 IM 系统集成示例
    
    这个类展示了如何将 MetaHub Webhook 集成到你的 IM 系统中
    """
    
    def __init__(self, metahub_url: str, metahub_api_key: str):
        self.webhook_client = MetaHubWebhookClient(metahub_url, metahub_api_key)
    
    def on_message_received(self, message_data: dict):
        """
        当你的 IM 系统收到消息时调用此方法
        
        Args:
            message_data: 你的 IM 系统的消息数据
        """
        try:
            # 将你的消息格式转换为 MetaHub 格式
            response = self.webhook_client.send_message(
                session_id=message_data["chat_id"],
                message_id=message_data["msg_id"],
                sender_user_id=message_data["from_user"]["id"],
                sender_nickname=message_data["from_user"]["name"],
                message_text=message_data["text"],
                session_type="group" if message_data.get("is_group") else "pm",
                source=message_data.get("source", "custom")  # 从你的系统获取来源
            )
            
            print(f"✅ 消息已发送到 MetaHub: {response['status']}")
            
        except Exception as e:
            print(f"❌ 发送失败: {e}")
    
    def example_usage(self):
        """示例：处理收到的消息"""
        # 模拟收到的消息
        incoming_message = {
            "chat_id": "chat_123",
            "msg_id": "msg_456",
            "from_user": {
                "id": "user_789",
                "name": "王五"
            },
            "text": "请帮我审核一下这个文档，明天上午需要",
            "is_group": False
        }
        
        # 处理消息
        self.on_message_received(incoming_message)


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("MetaHub Webhook 集成示例")
    print("=" * 60 + "\n")
    
    # 运行示例
    # 注意：需要先替换 API Key
    
    print("⚠️  请先在代码中替换 API Key，然后取消注释以下代码运行示例\n")
    
    # example_basic_usage()
    # example_group_message()
    # example_batch_messages()
    # example_error_handling()
    
    # 集成示例
    # integration = YourIMSystemIntegration(
    #     metahub_url="http://localhost:8000",
    #     metahub_api_key="sk-your-api-key-here"
    # )
    # integration.example_usage()
    
    print("\n" + "=" * 60)
    print("更多信息请查看:")
    print("  - WEBHOOK_QUICKSTART.md")
    print("  - WEBHOOK_IM_MESSAGE_GUIDE.md")
    print("  - WEBHOOK_ARCHITECTURE.md")
    print("=" * 60 + "\n")
