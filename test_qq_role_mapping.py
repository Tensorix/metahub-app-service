"""测试 QQ Chat Exporter role 映射"""
import json
from app.service.import_adapters import detect_format, get_adapter
from collections import Counter

print("=" * 70)
print("QQ Chat Exporter Role 映射测试")
print("=" * 70)

# 读取 QQ 导出文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 获取适配器并标准化
format_id = detect_format(data)
adapter = get_adapter(format_id)
normalized = adapter.normalize(data)

# 提取数据
chat_info = data.get('chatInfo', {})
self_uid = chat_info.get('selfUid', '')
self_name = chat_info.get('selfName', '')

messages = normalized.get('messages', [])
senders = normalized.get('senders', [])

print(f"\n会话信息:")
print(f"  类型: {chat_info.get('type')}")
print(f"  名称: {chat_info.get('name')}")
print(f"  自己的 UID: {self_uid}")
print(f"  自己的名称: {self_name}")

print(f"\n" + "=" * 70)
print("Role 分布统计")
print("=" * 70)

# 统计 role 分布
role_counter = Counter(msg.get('role') for msg in messages)
total_messages = len(messages)

print(f"\n总消息数: {total_messages}")
print(f"\nRole 分布:")
for role, count in role_counter.most_common():
    percentage = count / total_messages * 100
    print(f"  {role:10s}: {count:4d} ({percentage:5.1f}%)")

print(f"\n" + "=" * 70)
print("Role 映射验证")
print("=" * 70)

# 找出自己发送的消息
self_messages = [msg for msg in messages if msg.get('sender_id') == self_uid]
other_messages = [msg for msg in messages if msg.get('sender_id') != self_uid]

print(f"\n自己发送的消息: {len(self_messages)}")
if self_messages:
    self_roles = set(msg.get('role') for msg in self_messages)
    print(f"  Role 类型: {self_roles}")
    if self_roles == {'self'}:
        print(f"  ✓ 正确：所有自己的消息都是 'self'")
    else:
        print(f"  ✗ 错误：自己的消息应该都是 'self'")

print(f"\n其他人发送的消息: {len(other_messages)}")
if other_messages:
    other_roles = set(msg.get('role') for msg in other_messages)
    print(f"  Role 类型: {other_roles}")
    if other_roles == {'null'}:
        print(f"  ✓ 正确：所有其他人的消息都是 'null'")
    else:
        print(f"  ✗ 错误：其他人的消息应该都是 'null'")

print(f"\n" + "=" * 70)
print("示例消息")
print("=" * 70)

# 显示自己的消息示例
print(f"\n自己的消息示例（前3条）:")
for i, msg in enumerate(self_messages[:3], 1):
    sender_id = msg.get('sender_id')
    sender = next((s for s in senders if s.get('original_id') == sender_id), None)
    sender_name = sender.get('name') if sender else 'Unknown'
    content = msg.get('content', '')[:50]
    print(f"  {i}. [{msg.get('role')}] {sender_name}: {content}...")

# 显示其他人的消息示例
print(f"\n其他人的消息示例（前3条）:")
for i, msg in enumerate(other_messages[:3], 1):
    sender_id = msg.get('sender_id')
    sender = next((s for s in senders if s.get('original_id') == sender_id), None)
    sender_name = sender.get('name') if sender else 'Unknown'
    content = msg.get('content', '')[:50]
    print(f"  {i}. [{msg.get('role')}] {sender_name}: {content}...")

print(f"\n" + "=" * 70)
print("Role 语义说明")
print("=" * 70)

print(f"""
当前 Role 映射规则:
  - 'self': 自己发送的消息（sender_uid == selfUid）
  - 'null': 其他人发送的消息（群聊成员、私聊对方等）

与其他 Role 的区别:
  - 'user': AI 对话中的用户输入
  - 'assistant': AI 对话中的 AI 回复
  - 'system': 系统消息
  - 'self': IM 导入中自己发送的消息
  - 'null': IM 导入中其他人发送的消息（通用角色）
""")

print(f"\n" + "=" * 70)
print("测试完成")
print("=" * 70)

# 验证结果
all_checks_passed = (
    len(self_messages) > 0 and
    len(other_messages) > 0 and
    all(msg.get('role') == 'self' for msg in self_messages) and
    all(msg.get('role') == 'null' for msg in other_messages)
)

if all_checks_passed:
    print(f"\n✅ 所有检查通过！")
    print(f"   - 自己的消息正确标记为 'self'")
    print(f"   - 其他人的消息正确标记为 'null'")
    print(f"   - Role 映射符合预期")
else:
    print(f"\n⚠️  部分检查未通过，请检查上述详情")
