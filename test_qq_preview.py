"""测试 QQ Chat Exporter 预览功能"""
import json
from io import BytesIO
from app.service.session_transfer import SessionTransferService
from app.service.import_adapters import detect_format, get_adapter

# 读取示例文件
with open('group_1070511173_20260129_145029.json', 'r', encoding='utf-8') as f:
    content = f.read()

print("=" * 60)
print("测试 QQ Chat Exporter V5 预览功能")
print("=" * 60)

# 模拟预览
try:
    result = SessionTransferService._preview_json(
        db=None,  # 预览不需要数据库
        content=content.encode('utf-8'),
        user_id=None,  # 预览不需要用户ID
    )
    
    print(f"\n✅ 预览成功!")
    print(f"\n基本信息:")
    print(f"  有效: {result.valid}")
    print(f"  格式: {result.format}")
    print(f"  版本: {result.version}")
    print(f"  导出ID: {result.export_id}")
    
    if result.warnings:
        print(f"\n⚠️  警告:")
        for warning in result.warnings:
            print(f"  - {warning}")
    
    if result.errors:
        print(f"\n❌ 错误:")
        for error in result.errors:
            print(f"  - {error}")
    
    if result.sessions:
        print(f"\n会话列表 ({len(result.sessions)} 个):")
        for i, session in enumerate(result.sessions, 1):
            print(f"  {i}. {session.name}")
            print(f"     类型: {session.type}")
            print(f"     消息数: {session.message_count}")
            print(f"     话题数: {session.topic_count}")
    
    if result.total_statistics:
        print(f"\n统计信息:")
        stats = result.total_statistics
        if isinstance(stats, dict):
            print(f"  总消息数: {stats.get('total_messages', 0)}")
            print(f"  总话题数: {stats.get('total_topics', 0)}")
            print(f"  总发送者: {stats.get('total_senders', 0)}")
        else:
            print(f"  总消息数: {stats.total_messages}")
            print(f"  总话题数: {stats.total_topics}")
            print(f"  总发送者: {stats.total_senders}")
    
except Exception as e:
    print(f"\n❌ 预览失败: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
