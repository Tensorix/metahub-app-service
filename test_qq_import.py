"""测试 QQ Chat Exporter 导入功能"""
import json
from app.service.import_adapters import detect_format, get_adapter

# 读取示例文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=" * 60)
print("测试 QQ Chat Exporter V5 格式检测")
print("=" * 60)

# 1. 测试格式检测
print("\n1. 格式检测:")
format_id = detect_format(data)
print(f"   检测到的格式: {format_id}")

# 2. 获取适配器
print("\n2. 获取适配器:")
adapter = get_adapter(format_id) if format_id else None
if adapter:
    print(f"   适配器: {adapter.__class__.__name__}")
    print(f"   FORMAT_ID: {adapter.FORMAT_ID}")
    print(f"   FORMAT_NAME: {adapter.FORMAT_NAME}")
else:
    print("   未找到适配器")

# 3. 验证数据
if adapter:
    print("\n3. 验证数据:")
    validation = adapter.validate(data)
    print(f"   有效: {validation['valid']}")
    if validation['errors']:
        print(f"   错误: {validation['errors']}")
    if validation['warnings']:
        print(f"   警告: {validation['warnings']}")

# 4. 标准化数据
if adapter and validation['valid']:
    print("\n4. 标准化数据:")
    try:
        normalized = adapter.normalize(data)
        session = normalized.get('session', {})
        messages = normalized.get('messages', [])
        
        print(f"   会话标题: {session.get('title')}")
        print(f"   会话类型: {session.get('metadata', {}).get('chat_type')}")
        print(f"   消息数量: {len(messages)}")
        
        if messages:
            print(f"\n   前3条消息预览:")
            for i, msg in enumerate(messages[:3], 1):
                print(f"   {i}. [{msg['role']}] {msg['content'][:50]}...")
                
    except Exception as e:
        print(f"   标准化失败: {e}")
        import traceback
        traceback.print_exc()

# 5. 提取版本信息
print("\n5. 版本信息:")
metadata = data.get('metadata', {})
print(f"   工具名称: {metadata.get('name')}")
print(f"   版本: {metadata.get('version')}")

# 6. 统计信息
print("\n6. 统计信息:")
stats = data.get('statistics', {})
print(f"   总消息数: {stats.get('totalMessages')}")
time_range = stats.get('timeRange', {})
print(f"   时间范围: {time_range.get('start')} 至 {time_range.get('end')}")
print(f"   持续天数: {time_range.get('durationDays')}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
