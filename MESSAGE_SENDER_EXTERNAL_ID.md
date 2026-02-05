# MessageSender external_id 功能实现

## 概述

为 `message_sender` 表添加 `external_id` 字段，用于存储外部系统的唯一标识符（如 QQ UID、Webhook sender_id 等），实现跨系统的发送者去重和唯一身份识别。

## 数据库变更

### 迁移脚本
- **文件**: `alembic/versions/f1b3eaa785ac_add_external_id_to_message_sender.py`
- **操作**:
  - 添加 `external_id` 字段（VARCHAR(255), nullable）
  - 创建索引 `ix_message_sender_external_id` 用于快速查找

### 模型更新
- **文件**: `app/db/model/message_sender.py`
- **新增字段**:
  ```python
  external_id: Mapped[Optional[str]] = mapped_column(
      String(255), 
      nullable=True, 
      index=True,
      comment="外部系统的唯一标识符（如QQ UID、Webhook sender_id等）"
  )
  ```

## 功能实现

### 1. QQ Chat Exporter 导入

**文件**: `app/service/import_adapters/qq_chat_exporter.py`

**实现**:
- 在 `normalize()` 方法中，为每个发送者添加 `external_id` 字段
- 使用 QQ UID 作为 `external_id` 值

```python
senders_map[sender_uid] = {
    'original_id': sender_uid,
    'external_id': sender_uid,  # 使用 QQ UID 作为 external_id
    'name': sender_name,
}
```

**效果**:
- ✅ 89 个发送者全部包含 `external_id`
- ✅ `external_id` 与 `original_id` 一致（QQ UID）
- ✅ 支持跨导入批次的发送者去重

### 2. 导入服务去重

**文件**: `app/service/session_transfer.py`

**实现**:
- 在 `_do_import_single()` 方法中，优先使用 `external_id` 查找已存在的发送者
- 如果找不到，再尝试按名称查找
- 如果找到已存在的发送者但没有 `external_id`，则更新它

```python
# 优先使用 external_id 查找（精确匹配）
if external_id:
    existing = db.query(MessageSender).filter(
        MessageSender.external_id == external_id
    ).first()

# 如果没有找到，再尝试按名称查找
if not existing:
    existing = db.query(MessageSender).filter(
        MessageSender.name == sender_name
    ).first()

# 如果找到已存在的发送者，更新 external_id（如果之前没有）
if existing:
    if external_id and not existing.external_id:
        existing.external_id = external_id
        db.flush()
```

**效果**:
- ✅ 精确匹配：使用 `external_id` 进行精确去重
- ✅ 向后兼容：支持按名称查找旧数据
- ✅ 自动更新：为旧数据补充 `external_id`

### 3. Webhook 发送者去重

**文件**: `app/service/webhook.py`

**实现**:
- 在 `_get_or_create_sender()` 方法中，使用 `user_id` 作为 `external_id`
- 优先使用 `external_id` 查找已存在的发送者
- 如果找不到，再尝试按名称查找
- 如果找到已存在的发送者但没有 `external_id`，则更新它

```python
sender_external_id = sender_data.get("user_id")  # 使用 user_id 作为 external_id

# 优先使用 external_id 查找
if sender_external_id:
    sender = db.query(MessageSender).filter(
        MessageSender.external_id == sender_external_id
    ).first()

# 如果没有找到，再尝试按名称查找
if not sender:
    sender = db.query(MessageSender).filter(
        MessageSender.name == sender_name
    ).first()
    
    # 如果找到了但没有 external_id，更新它
    if sender and sender_external_id and not sender.external_id:
        sender.external_id = sender_external_id
        db.flush()

# 创建新 sender
if not sender:
    sender = MessageSender(
        name=sender_name,
        external_id=sender_external_id
    )
```

**效果**:
- ✅ 使用 webhook 的 `user_id` 作为唯一标识
- ✅ 避免同一用户因改名而创建多个发送者记录
- ✅ 支持跨 webhook 调用的发送者去重

### 4. WebSocket/Sync 服务

**文件**: `app/service/sync.py`

**说明**:
- Sync 服务不直接创建 `MessageSender`，只引用 `sender_id`
- 发送者的创建由其他服务（如 Webhook）负责
- Sync 服务通过 `sender_id` 关联已存在的发送者

## 去重策略

### 优先级
1. **external_id 精确匹配**（最高优先级）
   - 如果提供了 `external_id`，优先使用它查找
   - 保证跨系统的唯一性

2. **名称模糊匹配**（向后兼容）
   - 如果没有 `external_id` 或找不到匹配，按名称查找
   - 支持旧数据的兼容

3. **自动更新**
   - 如果按名称找到了发送者但没有 `external_id`，自动补充
   - 逐步完善数据质量

### 使用场景

| 场景 | external_id 来源 | 去重效果 |
|------|-----------------|---------|
| QQ Chat Exporter 导入 | QQ UID (如 `u_c-BS66-yKXpygXFQTl41ZA`) | 同一 QQ 用户在多次导入中只创建一个发送者 |
| Webhook IM 消息 | webhook 的 `user_id` (如 `qq_12345`) | 同一 IM 用户在多次 webhook 调用中只创建一个发送者 |
| 手动创建消息 | 可选，由调用方提供 | 支持自定义唯一标识 |

## 测试结果

### 1. QQ Chat Exporter 适配器
```
✓ 发送者总数: 89
✓ 所有发送者都有 external_id: True
✓ external_id 与 original_id 一致
```

### 2. 导入服务去重
```
✓ 使用 external_id 精确匹配
✓ 重复的 external_id 被正确合并
✓ 统计信息准确（导入数 + 合并数）
```

### 3. Webhook 发送者去重
```
✓ 相同 user_id 复用已存在的发送者
✓ 不同 user_id 创建新发送者
✓ 自动更新旧发送者的 external_id
```

## 数据迁移

### 现有数据
- 现有的 `message_sender` 记录的 `external_id` 为 `NULL`
- 不影响现有功能，向后兼容

### 逐步完善
- 新导入的数据会自动填充 `external_id`
- Webhook 创建的发送者会自动填充 `external_id`
- 旧数据在下次匹配时会自动更新 `external_id`

## API 变更

### 无需变更
- 所有 API 保持向后兼容
- `external_id` 是可选字段，不影响现有调用

### 可选增强
如果需要在 API 中暴露 `external_id`，可以在相关 Schema 中添加：

```python
# app/schema/xxx.py
class MessageSenderResponse(BaseModel):
    id: UUID
    name: str
    external_id: Optional[str] = None  # 新增
    created_at: datetime
```

## 总结

### ✅ 已实现
1. 数据库迁移：添加 `external_id` 字段和索引
2. 模型更新：`MessageSender` 模型包含 `external_id`
3. QQ 导入：使用 QQ UID 作为 `external_id`
4. 导入去重：优先使用 `external_id` 进行精确匹配
5. Webhook 去重：使用 `user_id` 作为 `external_id`
6. 向后兼容：支持旧数据的名称匹配
7. 自动更新：为旧数据补充 `external_id`

### 🎯 效果
- 跨系统的发送者唯一性识别
- 避免重复创建发送者记录
- 提高数据质量和一致性
- 支持多种外部系统集成

### 📝 文件清单
- `alembic/versions/f1b3eaa785ac_add_external_id_to_message_sender.py` - 数据库迁移
- `app/db/model/message_sender.py` - 模型定义
- `app/service/import_adapters/qq_chat_exporter.py` - QQ 导入适配器
- `app/service/session_transfer.py` - 导入服务
- `app/service/webhook.py` - Webhook 服务
- `test_sender_external_id.py` - 功能测试脚本
- `MESSAGE_SENDER_EXTERNAL_ID.md` - 本文档
