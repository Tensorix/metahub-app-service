"""
测试 QQ Chat Exporter 导入后消息内容不包含发送者名称
"""
import json
from app.service.import_adapters.qq_chat_exporter import QQChatExporterAdapter


def test_message_content_without_sender_name():
    """测试消息内容不包含发送者名称"""
    
    # 加载测试数据
    with open("group_1070511173_20260129_145029.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # 创建适配器
    adapter = QQChatExporterAdapter()
    
    # 验证格式
    assert adapter.detect(data), "应该检测到 QQ Chat Exporter V5 格式"
    
    # 标准化数据
    normalized = adapter.normalize(data)
    
    # 检查消息
    messages = normalized.get("messages", [])
    print(f"\n总共 {len(messages)} 条消息")
    
    # 查找"沙音木偶"发送的回复消息
    test_cases = []
    for msg in messages:
        metadata = msg.get("metadata", {})
        sender_name = metadata.get("sender_name", "")
        content = msg.get("content", "")
        
        if sender_name == "沙音木偶" and "[回复" in content:
            test_cases.append({
                "sender_name": sender_name,
                "content": content,
                "metadata": metadata
            })
    
    print(f"\n找到 {len(test_cases)} 条沙音木偶的回复消息")
    
    # 验证消息内容
    for i, case in enumerate(test_cases[:3], 1):  # 只检查前3条
        print(f"\n--- 测试用例 {i} ---")
        print(f"发送者: {case['sender_name']}")
        print(f"消息内容: {case['content']}")
        
        # 关键验证：消息内容不应该以"发送者名称: "开头
        assert not case['content'].startswith(f"{case['sender_name']}: "), \
            f"❌ 消息内容不应该包含发送者名称前缀！\n内容: {case['content']}"
        
        # 验证发送者名称在 metadata 中
        assert case['metadata'].get('sender_name') == case['sender_name'], \
            "发送者名称应该在 metadata 中"
        
        print(f"✅ 通过：消息内容不包含发送者名称前缀")
    
    # 测试普通文本消息
    print("\n\n=== 测试普通文本消息 ===")
    text_messages = [msg for msg in messages 
                     if msg.get("metadata", {}).get("message_type") == "type_1"][:5]
    
    for i, msg in enumerate(text_messages, 1):
        metadata = msg.get("metadata", {})
        sender_name = metadata.get("sender_name", "")
        content = msg.get("content", "")
        
        print(f"\n消息 {i}:")
        print(f"  发送者: {sender_name}")
        print(f"  内容: {content[:100]}...")
        
        # 验证不包含发送者名称前缀
        assert not content.startswith(f"{sender_name}: "), \
            f"❌ 普通消息也不应该包含发送者名称前缀！"
        
        print(f"  ✅ 通过")
    
    print("\n\n" + "="*60)
    print("✅ 所有测试通过！")
    print("="*60)
    print("\n修复说明：")
    print("1. 消息内容不再包含发送者名称前缀")
    print("2. 发送者信息通过 sender_id 关联到 MessageSender 表")
    print("3. 发送者名称保存在 metadata.sender_name 中")
    print("4. 前端应该从 sender 关系中获取并显示发送者名称")


if __name__ == "__main__":
    test_message_content_without_sender_name()
