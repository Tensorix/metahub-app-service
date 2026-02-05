"""测试 QQ Chat Exporter 完整数据结构"""
import json
from app.service.import_adapters import detect_format, get_adapter

# 读取示例文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=" * 60)
print("测试 QQ Chat Exporter V5 完整数据结构")
print("=" * 60)

# 获取适配器并标准化
format_id = detect_format(data)
adapter = get_adapter(format_id)
normalized = adapter.normalize(data)

session = normalized.get('session', {})
senders = normalized.get('senders', [])
messages = normalized.get('messages', [])

print(f"\n1. 会话信息:")
print(f"   标题: {session.get('title')}")
print(f"   类型: {session.get('type')}")

print(f"\n2. 发送者列表:")
print(f"   总数: {len(senders)}")
if senders:
    print(f"   前5个发送者:")
    for i, sender in enumerate(senders[:5], 1):
        print(f"     {i}. {sender.get('name')} (ID: {sender.get('original_id')})")
else:
    print(f"   ❌ 没有发送者!")

print(f"\n3. 消息列表:")
print(f"   总数: {len(messages)}")

print(f"\n4. 检查前3条消息:")
for i, msg in enumerate(messages[:3], 1):
    print(f"\n   消息 {i}:")
    print(f"     role: {msg.get('role')}")
    print(f"     sender_id: {msg.get('sender_id')}")
    print(f"     content: {msg.get('content', '')[:50]}...")
    
    # 检查 sender_id 是否在 senders 列表中
    sender_id = msg.get('sender_id')
    if sender_id:
        sender_found = any(s.get('original_id') == sender_id for s in senders)
        if sender_found:
            sender_name = next((s.get('name') for s in senders if s.get('original_id') == sender_id), None)
            print(f"     ✅ sender 存在: {sender_name}")
        else:
            print(f"     ❌ sender 不存在于 senders 列表中!")
    else:
        print(f"     ⚠️  没有 sender_id")
    
    # 检查 parts
    parts = msg.get('parts', [])
    print(f"     parts 数量: {len(parts)}")
    if parts:
        for j, part in enumerate(parts, 1):
            print(f"       Part {j}: type={part.get('type')}, content={part.get('content', '')[:30]}...")
    else:
        print(f"     ❌ 没有 parts!")

print(f"\n5. 验证所有消息:")
messages_without_sender = [i for i, msg in enumerate(messages, 1) if not msg.get('sender_id')]
messages_without_parts = [i for i, msg in enumerate(messages, 1) if not msg.get('parts')]

if messages_without_sender:
    print(f"   ⚠️  {len(messages_without_sender)} 条消息没有 sender_id")
else:
    print(f"   ✅ 所有消息都有 sender_id")

if messages_without_parts:
    print(f"   ❌ {len(messages_without_parts)} 条消息没有 parts")
else:
    print(f"   ✅ 所有消息都有 parts")

# 验证 sender_id 引用完整性
print(f"\n6. 验证 sender_id 引用完整性:")
sender_ids = {s.get('original_id') for s in senders}
message_sender_ids = {msg.get('sender_id') for msg in messages if msg.get('sender_id')}
orphan_sender_ids = message_sender_ids - sender_ids

if orphan_sender_ids:
    print(f"   ❌ {len(orphan_sender_ids)} 个 sender_id 在 senders 列表中不存在")
    print(f"   孤立的 sender_id: {list(orphan_sender_ids)[:5]}")
else:
    print(f"   ✅ 所有 sender_id 都有对应的 sender 记录")

print(f"\n7. 统计信息:")
print(f"   唯一发送者数: {len(senders)}")
print(f"   消息中使用的发送者数: {len(message_sender_ids)}")
print(f"   未使用的发送者数: {len(sender_ids - message_sender_ids)}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
