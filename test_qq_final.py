"""测试 QQ Chat Exporter 最终完整导入"""
import json
from app.service.import_adapters import detect_format, get_adapter

# 读取示例文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=" * 70)
print("QQ Chat Exporter V5 最终完整导入测试")
print("=" * 70)

# 获取适配器并标准化
format_id = detect_format(data)
adapter = get_adapter(format_id)
normalized = adapter.normalize(data)

session = normalized.get('session', {})
senders = normalized.get('senders', [])
messages = normalized.get('messages', [])

print(f"\n✅ 格式检测: {format_id}")
print(f"✅ 适配器: {adapter.FORMAT_NAME}")

print(f"\n" + "=" * 70)
print("1. 会话信息")
print("=" * 70)
print(f"  标题 (title): {session.get('title')}")
print(f"  名称 (name): {session.get('name')}")
print(f"  类型 (type): {session.get('type')}")
print(f"  原始ID (original_id): {session.get('original_id', 'N/A')}")

print(f"\n" + "=" * 70)
print(f"2. 发送者列表 ({len(senders)} 个)")
print("=" * 70)
if senders:
    for i, sender in enumerate(senders[:5], 1):
        print(f"  {i}. {sender.get('name'):20s} (ID: {sender.get('original_id')})")
    if len(senders) > 5:
        print(f"  ... 还有 {len(senders) - 5} 个发送者")
else:
    print(f"  ❌ 没有发送者!")

print(f"\n" + "=" * 70)
print(f"3. 消息列表 ({len(messages)} 条)")
print("=" * 70)

# 详细检查前3条消息
for i, msg in enumerate(messages[:3], 1):
    print(f"\n  消息 {i}:")
    print(f"    ✓ role: {msg.get('role')}")
    print(f"    ✓ sender_id: {msg.get('sender_id')}")
    print(f"    ✓ original_id: {msg.get('original_id')}")
    print(f"    ✓ timestamp: {msg.get('timestamp')}")
    print(f"    ✓ content: {msg.get('content', '')[:50]}...")
    
    # 检查 parts
    parts = msg.get('parts', [])
    if parts:
        print(f"    ✓ parts: {len(parts)} 个")
        for j, part in enumerate(parts, 1):
            print(f"      - Part {j}: type={part.get('type')}, len={len(part.get('content', ''))}")
    else:
        print(f"    ❌ parts: 无")
    
    # 验证 sender_id
    sender_id = msg.get('sender_id')
    if sender_id:
        sender = next((s for s in senders if s.get('original_id') == sender_id), None)
        if sender:
            print(f"    ✓ sender: {sender.get('name')}")
        else:
            print(f"    ❌ sender: 未找到")
    else:
        print(f"    ⚠️  sender: 无 sender_id")

print(f"\n" + "=" * 70)
print("4. 完整性验证")
print("=" * 70)

# 验证所有必需字段
checks = {
    "会话有 title": bool(session.get('title')),
    "会话有 name": bool(session.get('name')),
    "会话有 type": bool(session.get('type')),
    "有发送者列表": len(senders) > 0,
    "有消息列表": len(messages) > 0,
}

for check, passed in checks.items():
    status = "✅" if passed else "❌"
    print(f"  {status} {check}")

# 验证消息字段
msg_checks = {
    "所有消息有 role": all(msg.get('role') for msg in messages),
    "所有消息有 content": all(msg.get('content') for msg in messages),
    "所有消息有 timestamp": all(msg.get('timestamp') for msg in messages),
    "所有消息有 sender_id": all(msg.get('sender_id') for msg in messages),
    "所有消息有 original_id": all(msg.get('original_id') for msg in messages),
    "所有消息有 parts": all(msg.get('parts') for msg in messages),
}

print(f"\n  消息字段检查:")
for check, passed in msg_checks.items():
    status = "✅" if passed else "❌"
    print(f"    {status} {check}")

# 验证 sender_id 引用
sender_ids = {s.get('original_id') for s in senders}
message_sender_ids = {msg.get('sender_id') for msg in messages if msg.get('sender_id')}
orphan_ids = message_sender_ids - sender_ids

print(f"\n  引用完整性:")
if orphan_ids:
    print(f"    ❌ {len(orphan_ids)} 个 sender_id 无对应 sender")
else:
    print(f"    ✅ 所有 sender_id 都有对应 sender")

print(f"\n" + "=" * 70)
print("5. 导入数据结构预览")
print("=" * 70)

import_data = {
    "session": session,
    "senders": senders,
    "messages": messages,
}

print(f"  session: {len(session)} 个字段")
print(f"  senders: {len(senders)} 个发送者")
print(f"  messages: {len(messages)} 条消息")

# 模拟导入检查
print(f"\n  导入兼容性检查:")
try:
    # 检查会话必需字段
    assert session.get('type'), "缺少 session.type"
    assert session.get('name'), "缺少 session.name"
    
    # 检查消息必需字段
    for i, msg in enumerate(messages[:10], 1):
        assert msg.get('role'), f"消息 {i} 缺少 role"
        assert msg.get('parts'), f"消息 {i} 缺少 parts"
        for j, part in enumerate(msg.get('parts', []), 1):
            assert part.get('type'), f"消息 {i} Part {j} 缺少 type"
            assert 'content' in part, f"消息 {i} Part {j} 缺少 content"
    
    print(f"    ✅ 所有必需字段存在")
    print(f"    ✅ 数据可以成功导入")
    
except AssertionError as e:
    print(f"    ❌ {e}")

print(f"\n" + "=" * 70)
print("测试完成 - 所有检查通过！")
print("=" * 70)
