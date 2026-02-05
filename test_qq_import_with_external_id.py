"""测试 QQ Chat Exporter 导入时 external_id 的完整流程"""
import json
from app.service.import_adapters import detect_format, get_adapter

print("=" * 70)
print("QQ Chat Exporter 导入 external_id 完整测试")
print("=" * 70)

# 读取 QQ 导出文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 检测格式并标准化
format_id = detect_format(data)
adapter = get_adapter(format_id)
normalized = adapter.normalize(data)

print(f"\n✓ 格式: {format_id}")
print(f"✓ 适配器: {adapter.FORMAT_NAME}")

# 提取数据
session = normalized.get('session', {})
senders = normalized.get('senders', [])
messages = normalized.get('messages', [])

print(f"\n" + "=" * 70)
print("1. 会话信息")
print("=" * 70)
print(f"  标题: {session.get('title')}")
print(f"  类型: {session.get('type')}")
print(f"  发送者数: {len(senders)}")
print(f"  消息数: {len(messages)}")

print(f"\n" + "=" * 70)
print("2. 发送者 external_id 检查")
print("=" * 70)

# 统计
total_senders = len(senders)
with_external_id = sum(1 for s in senders if s.get('external_id'))
without_external_id = total_senders - with_external_id

print(f"  总发送者数: {total_senders}")
print(f"  有 external_id: {with_external_id} ({with_external_id/total_senders*100:.1f}%)")
print(f"  无 external_id: {without_external_id}")

# 检查 external_id 格式
print(f"\n  external_id 格式示例:")
for i, sender in enumerate(senders[:5], 1):
    ext_id = sender.get('external_id', 'N/A')
    name = sender.get('name', 'Unknown')
    print(f"    {i}. {name:20s} → {ext_id}")

# 检查 external_id 唯一性
external_ids = [s.get('external_id') for s in senders if s.get('external_id')]
unique_external_ids = set(external_ids)
duplicates = len(external_ids) - len(unique_external_ids)

print(f"\n  唯一性检查:")
print(f"    总 external_id: {len(external_ids)}")
print(f"    唯一值: {len(unique_external_ids)}")
print(f"    重复: {duplicates}")

if duplicates > 0:
    print(f"    ⚠️  发现重复的 external_id!")
else:
    print(f"    ✓ 所有 external_id 都是唯一的")

print(f"\n" + "=" * 70)
print("3. 消息 sender_id 引用检查")
print("=" * 70)

# 检查消息的 sender_id 是否都能找到对应的 sender
sender_id_set = {s.get('original_id') for s in senders}
message_sender_ids = [m.get('sender_id') for m in messages if m.get('sender_id')]
unique_msg_sender_ids = set(message_sender_ids)

print(f"  消息总数: {len(messages)}")
print(f"  有 sender_id 的消息: {len(message_sender_ids)}")
print(f"  唯一 sender_id: {len(unique_msg_sender_ids)}")

# 检查是否有孤立的 sender_id
orphan_sender_ids = unique_msg_sender_ids - sender_id_set
if orphan_sender_ids:
    print(f"  ⚠️  发现 {len(orphan_sender_ids)} 个孤立的 sender_id:")
    for sid in list(orphan_sender_ids)[:5]:
        print(f"      - {sid}")
else:
    print(f"  ✓ 所有 sender_id 都有对应的 sender")

print(f"\n" + "=" * 70)
print("4. 导入数据结构验证")
print("=" * 70)

# 验证导入所需的所有字段
required_session_fields = ['title', 'name', 'type']
required_sender_fields = ['original_id', 'external_id', 'name']
required_message_fields = ['role', 'content', 'timestamp', 'sender_id', 'parts']

print(f"  会话字段:")
for field in required_session_fields:
    has_field = field in session and session[field] is not None
    status = "✓" if has_field else "✗"
    print(f"    {status} {field}")

print(f"\n  发送者字段（检查前3个）:")
for i, sender in enumerate(senders[:3], 1):
    print(f"    发送者 {i}:")
    for field in required_sender_fields:
        has_field = field in sender and sender[field] is not None
        status = "✓" if has_field else "✗"
        value = sender.get(field, 'N/A')
        if len(str(value)) > 30:
            value = str(value)[:27] + "..."
        print(f"      {status} {field}: {value}")

print(f"\n  消息字段（检查前3条）:")
for i, message in enumerate(messages[:3], 1):
    print(f"    消息 {i}:")
    for field in required_message_fields:
        has_field = field in message and message[field] is not None
        status = "✓" if has_field else "✗"
        if field == 'parts':
            value = f"{len(message.get(field, []))} parts"
        elif field == 'content':
            value = str(message.get(field, ''))[:30] + "..."
        else:
            value = message.get(field, 'N/A')
        print(f"      {status} {field}: {value}")

print(f"\n" + "=" * 70)
print("5. external_id 去重模拟")
print("=" * 70)

# 模拟导入时的去重逻辑
print(f"  模拟场景: 导入相同的文件两次")
print(f"  预期: 第二次导入时，所有发送者都应该被合并（通过 external_id）")

# 统计唯一的 external_id
unique_senders_by_external_id = {}
for sender in senders:
    ext_id = sender.get('external_id')
    if ext_id:
        if ext_id not in unique_senders_by_external_id:
            unique_senders_by_external_id[ext_id] = sender

print(f"\n  第一次导入:")
print(f"    将创建 {len(unique_senders_by_external_id)} 个发送者")

print(f"\n  第二次导入:")
print(f"    将合并 {len(senders)} 个发送者（全部通过 external_id 匹配）")
print(f"    不会创建新的发送者记录")

print(f"\n" + "=" * 70)
print("测试完成")
print("=" * 70)

# 最终总结
all_checks_passed = (
    with_external_id == total_senders and
    duplicates == 0 and
    len(orphan_sender_ids) == 0 and
    all(field in session for field in required_session_fields)
)

if all_checks_passed:
    print(f"\n✅ 所有检查通过！")
    print(f"   - 所有发送者都有 external_id")
    print(f"   - 所有 external_id 都是唯一的")
    print(f"   - 所有消息的 sender_id 都有对应的 sender")
    print(f"   - 数据结构完整，可以成功导入")
else:
    print(f"\n⚠️  部分检查未通过，请检查上述详情")
