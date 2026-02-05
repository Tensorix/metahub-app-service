# MessageSender external_id 快速参考

## 一句话总结
为 `message_sender` 表添加 `external_id` 字段，用于跨系统的发送者唯一身份识别和去重。

## 核心变更

### 数据库
```sql
-- 新增字段
ALTER TABLE message_sender ADD COLUMN external_id VARCHAR(255);

-- 新增索引
CREATE INDEX ix_message_sender_external_id ON message_sender(external_id);
```

### 模型
```python
class MessageSender(Base):
    id: Mapped[UUID]
    name: Mapped[str]
    external_id: Mapped[Optional[str]]  # 新增
    created_at: Mapped[datetime]
```

## 使用方式

### 1. QQ Chat Exporter 导入
```python
# 自动使用 QQ UID 作为 external_id
{
    "original_id": "u_c-BS66-yKXpygXFQTl41ZA",
    "external_id": "u_c-BS66-yKXpygXFQTl41ZA",  # 自动填充
    "name": "速冻饺子"
}
```

### 2. Webhook IM 消息
```python
# 自动使用 user_id 作为 external_id
sender_data = {
    "user_id": "qq_12345",      # 作为 external_id
    "nickname": "QQ用户"
}

sender = WebhookService._get_or_create_sender(db, sender_data)
# sender.external_id = "qq_12345"
```

### 3. 手动创建
```python
sender = MessageSender(
    name="用户名",
    external_id="custom_id_123"  # 可选
)
```

## 去重逻辑

### 优先级
1. **external_id 精确匹配** ← 最优先
2. **名称模糊匹配** ← 向后兼容
3. **创建新记录** ← 最后选择

### 代码示例
```python
# 1. 优先使用 external_id 查找
if external_id:
    sender = db.query(MessageSender).filter(
        MessageSender.external_id == external_id
    ).first()

# 2. 如果没找到，按名称查找
if not sender:
    sender = db.query(MessageSender).filter(
        MessageSender.name == sender_name
    ).first()
    
    # 找到了但没有 external_id，更新它
    if sender and external_id and not sender.external_id:
        sender.external_id = external_id

# 3. 都没找到，创建新记录
if not sender:
    sender = MessageSender(
        name=sender_name,
        external_id=external_id
    )
```

## 测试

### 运行测试
```bash
python test_sender_external_id.py
```

### 预期结果
```
✓ QQ Chat Exporter 适配器正确提取 external_id
✓ 导入服务使用 external_id 进行发送者去重
✓ Webhook 服务使用 external_id 进行发送者去重
✓ 所有功能正常工作
```

## 迁移数据库

```bash
# 应用迁移
alembic upgrade head

# 回滚（如需要）
alembic downgrade -1
```

## 常见问题

### Q: 现有数据会受影响吗？
A: 不会。`external_id` 是可选字段（nullable），现有数据保持 `NULL`，不影响功能。

### Q: 如何为旧数据补充 external_id？
A: 系统会在下次匹配时自动更新。也可以手动更新：
```python
sender = db.query(MessageSender).filter_by(name="用户名").first()
sender.external_id = "external_id_value"
db.commit()
```

### Q: 不同系统的 external_id 会冲突吗？
A: 建议使用前缀区分，如：
- QQ: `qq_12345`
- WeChat: `wechat_67890`
- Telegram: `tg_11111`

### Q: 如何查询某个 external_id 的所有消息？
```python
sender = db.query(MessageSender).filter(
    MessageSender.external_id == "qq_12345"
).first()

messages = db.query(Message).filter(
    Message.sender_id == sender.id
).all()
```

## 相关文件

- 📄 `MESSAGE_SENDER_EXTERNAL_ID.md` - 完整文档
- 🧪 `test_sender_external_id.py` - 测试脚本
- 🗄️ `alembic/versions/f1b3eaa785ac_*.py` - 数据库迁移
- 📦 `app/db/model/message_sender.py` - 模型定义
- 🔧 `app/service/session_transfer.py` - 导入服务
- 🔧 `app/service/webhook.py` - Webhook 服务
- 🔧 `app/service/import_adapters/qq_chat_exporter.py` - QQ 适配器
