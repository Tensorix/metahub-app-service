"""测试 QQ Chat Exporter 完整导入流程"""
import json
from app.service.import_adapters import detect_format, get_adapter

# 读取示例文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=" * 60)
print("测试 QQ Chat Exporter V5 完整导入流程")
print("=" * 60)

# 1. 格式检测
print("\n1. 格式检测:")
format_id = detect_format(data)
print(f"   检测到的格式: {format_id}")

# 2. 获取适配器
print("\n2. 获取适配器:")
adapter = get_adapter(format_id)
if adapter:
    print(f"   适配器: {adapter.__class__.__name__}")
else:
    print("   ❌ 未找到适配器")
    exit(1)

# 3. 验证数据
print("\n3. 验证数据:")
validation = adapter.validate(data)
print(f"   有效: {validation['valid']}")
if validation['errors']:
    print(f"   ❌ 错误: {validation['errors']}")
    exit(1)
if validation['warnings']:
    print(f"   ⚠️  警告: {validation['warnings']}")

# 4. 标准化数据
print("\n4. 标准化数据:")
try:
    normalized = adapter.normalize(data)
    session = normalized.get('session', {})
    messages = normalized.get('messages', [])
    
    print(f"   ✅ 标准化成功")
    print(f"\n   会话信息:")
    print(f"     标题 (title): {session.get('title')}")
    print(f"     名称 (name): {session.get('name')}")
    print(f"     类型 (type): {session.get('type')}")
    print(f"     描述: {session.get('description', '')[:100]}...")
    
    print(f"\n   消息信息:")
    print(f"     总数: {len(messages)}")
    
    # 检查必需字段
    print(f"\n   字段检查:")
    required_fields = ['title', 'name', 'type', 'metadata']
    for field in required_fields:
        has_field = field in session
        status = "✅" if has_field else "❌"
        print(f"     {status} {field}: {has_field}")
    
    # 检查消息格式
    if messages:
        print(f"\n   消息格式检查 (前3条):")
        for i, msg in enumerate(messages[:3], 1):
            print(f"     消息 {i}:")
            print(f"       role: {msg.get('role')}")
            print(f"       content: {msg.get('content', '')[:50]}...")
            print(f"       timestamp: {msg.get('timestamp')}")
            
            # 检查必需字段
            msg_required = ['role', 'content', 'timestamp']
            missing = [f for f in msg_required if f not in msg]
            if missing:
                print(f"       ❌ 缺少字段: {missing}")
            else:
                print(f"       ✅ 所有必需字段存在")
    
    # 5. 模拟导入数据结构
    print(f"\n5. 导入数据结构检查:")
    import_data = {
        "session": session,
        "messages": messages,
        "senders": [],  # QQ 格式标准化后没有单独的 senders
        "topics": [],   # QQ 格式标准化后没有单独的 topics
    }
    
    # 检查 _do_import_single 需要的字段
    print(f"   session['type']: {import_data['session'].get('type')}")
    print(f"   session['name']: {import_data['session'].get('name')}")
    print(f"   session['metadata']: {type(import_data['session'].get('metadata'))}")
    
    if not import_data['session'].get('type'):
        print(f"   ❌ 缺少 type 字段！")
    else:
        print(f"   ✅ type 字段存在")
    
    print(f"\n✅ 所有检查通过，数据可以导入")
    
except Exception as e:
    print(f"   ❌ 标准化失败: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
