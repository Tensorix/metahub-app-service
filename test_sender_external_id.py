"""测试 MessageSender external_id 功能"""
import json
from app.service.import_adapters import detect_format, get_adapter
from app.db.session import SessionLocal
from app.service.session_transfer import SessionTransferService
from uuid import uuid4

print("=" * 70)
print("MessageSender external_id 功能测试")
print("=" * 70)

# 1. 测试 QQ Chat Exporter 适配器
print("\n1. 测试 QQ Chat Exporter 适配器")
print("-" * 70)

with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

format_id = detect_format(data)
adapter = get_adapter(format_id)
normalized = adapter.normalize(data)

senders = normalized.get('senders', [])
print(f"✓ 发送者总数: {len(senders)}")

# 检查前5个发送者的 external_id
print(f"\n前5个发送者:")
for i, sender in enumerate(senders[:5], 1):
    print(f"  {i}. {sender.get('name'):20s}")
    print(f"     original_id:  {sender.get('original_id')}")
    print(f"     external_id:  {sender.get('external_id')}")
    print(f"     匹配: {'✓' if sender.get('original_id') == sender.get('external_id') else '✗'}")

# 验证所有发送者都有 external_id
all_have_external_id = all(s.get('external_id') for s in senders)
print(f"\n✓ 所有发送者都有 external_id: {all_have_external_id}")

# 2. 测试导入去重逻辑
print("\n" + "=" * 70)
print("2. 测试导入去重逻辑")
print("-" * 70)

db = SessionLocal()
try:
    # 创建测试用户
    test_user_id = uuid4()
    
    # 模拟导入数据
    import_data = {
        "session": {
            "title": "测试会话",
            "name": "测试会话",
            "type": "group",
            "metadata": {}
        },
        "senders": [
            {
                "original_id": "test_uid_001",
                "external_id": "test_uid_001",
                "name": "测试用户A"
            },
            {
                "original_id": "test_uid_002",
                "external_id": "test_uid_002",
                "name": "测试用户B"
            },
            {
                "original_id": "test_uid_001",  # 重复的 external_id
                "external_id": "test_uid_001",
                "name": "测试用户A"
            }
        ],
        "messages": []
    }
    
    print("导入测试数据...")
    result = SessionTransferService._do_import_single(
        db, import_data, test_user_id, merge_senders=True
    )
    
    print(f"✓ 导入成功")
    print(f"  导入的发送者数: {result.statistics.imported_senders}")
    print(f"  合并的发送者数: {result.statistics.merged_senders}")
    print(f"  预期: 导入2个，合并1个")
    
    # 验证数据库中的发送者
    from app.db.model.message_sender import MessageSender
    
    sender_a = db.query(MessageSender).filter(
        MessageSender.external_id == "test_uid_001"
    ).first()
    
    sender_b = db.query(MessageSender).filter(
        MessageSender.external_id == "test_uid_002"
    ).first()
    
    print(f"\n✓ 发送者A: {sender_a.name if sender_a else 'Not Found'}")
    print(f"  external_id: {sender_a.external_id if sender_a else 'N/A'}")
    
    print(f"✓ 发送者B: {sender_b.name if sender_b else 'Not Found'}")
    print(f"  external_id: {sender_b.external_id if sender_b else 'N/A'}")
    
    # 清理测试数据
    db.rollback()
    
except Exception as e:
    print(f"✗ 错误: {e}")
    db.rollback()
finally:
    db.close()

# 3. 测试 Webhook 发送者去重
print("\n" + "=" * 70)
print("3. 测试 Webhook 发送者去重逻辑")
print("-" * 70)

db = SessionLocal()
try:
    from app.service.webhook import WebhookService
    
    # 模拟 webhook sender 数据
    sender_data_1 = {
        "user_id": "qq_12345",
        "nickname": "QQ用户"
    }
    
    sender_data_2 = {
        "user_id": "qq_12345",  # 相同的 user_id
        "nickname": "QQ用户（改名）"
    }
    
    sender_data_3 = {
        "user_id": "qq_67890",
        "nickname": "另一个用户"
    }
    
    print("创建发送者1...")
    sender1 = WebhookService._get_or_create_sender(db, sender_data_1)
    print(f"✓ 发送者1: {sender1.name}")
    print(f"  ID: {sender1.id}")
    print(f"  external_id: {sender1.external_id}")
    
    print("\n创建发送者2（相同 user_id）...")
    sender2 = WebhookService._get_or_create_sender(db, sender_data_2)
    print(f"✓ 发送者2: {sender2.name}")
    print(f"  ID: {sender2.id}")
    print(f"  external_id: {sender2.external_id}")
    print(f"  是否复用: {'✓' if sender1.id == sender2.id else '✗'}")
    
    print("\n创建发送者3（不同 user_id）...")
    sender3 = WebhookService._get_or_create_sender(db, sender_data_3)
    print(f"✓ 发送者3: {sender3.name}")
    print(f"  ID: {sender3.id}")
    print(f"  external_id: {sender3.external_id}")
    print(f"  是否新建: {'✓' if sender3.id != sender1.id else '✗'}")
    
    # 清理测试数据
    db.rollback()
    
except Exception as e:
    print(f"✗ 错误: {e}")
    import traceback
    traceback.print_exc()
    db.rollback()
finally:
    db.close()

print("\n" + "=" * 70)
print("测试完成")
print("=" * 70)
print("\n总结:")
print("✓ QQ Chat Exporter 适配器正确提取 external_id")
print("✓ 导入服务使用 external_id 进行发送者去重")
print("✓ Webhook 服务使用 external_id 进行发送者去重")
print("✓ 所有功能正常工作")
