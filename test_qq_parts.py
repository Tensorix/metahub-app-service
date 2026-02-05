"""测试 QQ Chat Exporter 消息 parts 格式"""
import json
from app.service.import_adapters import detect_format, get_adapter

# 读取示例文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=" * 60)
print("测试 QQ Chat Exporter V5 消息 Parts 格式")
print("=" * 60)

# 获取适配器
format_id = detect_format(data)
adapter = get_adapter(format_id)

# 标准化数据
normalized = adapter.normalize(data)
messages = normalized.get('messages', [])

print(f"\n总消息数: {len(messages)}")

# 检查前3条消息的 parts
print(f"\n检查前3条消息的 parts 格式:")
for i, msg in enumerate(messages[:3], 1):
    print(f"\n消息 {i}:")
    print(f"  role: {msg.get('role')}")
    print(f"  content: {msg.get('content', '')[:50]}...")
    
    parts = msg.get('parts', [])
    print(f"  parts 数量: {len(parts)}")
    
    if parts:
        for j, part in enumerate(parts, 1):
            print(f"    Part {j}:")
            print(f"      type: {part.get('type')}")
            print(f"      content: {part.get('content', '')[:50]}...")
            print(f"      metadata: {part.get('metadata')}")
            print(f"      event_id: {part.get('event_id')}")
            print(f"      raw_data: {part.get('raw_data')}")
    else:
        print(f"  ❌ 没有 parts!")

# 验证所有消息都有 parts
print(f"\n验证所有消息:")
messages_without_parts = [i for i, msg in enumerate(messages, 1) if not msg.get('parts')]
if messages_without_parts:
    print(f"  ❌ {len(messages_without_parts)} 条消息没有 parts")
    print(f"  消息索引: {messages_without_parts[:10]}...")
else:
    print(f"  ✅ 所有 {len(messages)} 条消息都有 parts")

# 验证 parts 格式
print(f"\n验证 parts 格式:")
for i, msg in enumerate(messages[:10], 1):
    parts = msg.get('parts', [])
    for j, part in enumerate(parts, 1):
        required_fields = ['type', 'content']
        missing = [f for f in required_fields if f not in part]
        if missing:
            print(f"  ❌ 消息 {i} Part {j} 缺少字段: {missing}")
            break
    else:
        continue
    break
else:
    print(f"  ✅ 前10条消息的 parts 格式正确")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
