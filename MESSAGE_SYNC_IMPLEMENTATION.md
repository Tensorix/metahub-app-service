# Message 同步功能实现总结

## 实现概述

已成功为项目添加 Message 同步功能，完全集成到现有的 Sync API 中。

## 修改的文件

### 1. 数据库迁移
- **文件**: `alembic/versions/7e4c81977053_add_user_id_and_version_to_message_table.py`
- **内容**: 为 `message` 表添加 `user_id` 和 `version` 字段
- **状态**: ✅ 已执行迁移

### 2. 数据模型
- **文件**: `app/db/model/message.py`
- **修改**:
  - 添加 `user_id` 字段（外键关联到 user 表）
  - 添加 `version` 字段（用于乐观锁）
  - 添加索引 `ix_message_user_id`

### 3. Schema 定义
- **文件**: `app/schema/sync.py`
- **新增**:
  - `MessagePartSyncItem`: MessagePart 同步项
  - `MessageSyncItem`: Message 同步项
  - `MessageSyncResult`: Message 同步结果
- **修改**:
  - `SyncRequest`: 添加 `messages` 字段
  - `SyncResponse`: 添加 `messages` 字段
  - `PullSyncRequest`: 添加 `include_messages` 字段
  - `PullSyncResponse`: 添加 `messages` 字段

### 4. 同步服务
- **文件**: `app/service/sync.py`
- **新增方法**:
  - `_sync_message()`: 同步单个 Message 的入口
  - `_create_message()`: 创建 Message
  - `_update_message()`: 更新 Message（支持版本控制）
  - `_delete_message()`: 删除 Message（软删除）
- **修改方法**:
  - `sync_batch()`: 添加 Message 同步处理
  - `pull_changes()`: 添加 Message 增量拉取

### 5. API 路由
- **文件**: `app/router/v1/sync.py`
- **修改**: 更新文档字符串，添加 Message 同步说明

### 6. 文档
- **文件**: `SYNC_API_GUIDE.md`
- **修改**: 添加 Message 同步的完整说明和示例

### 7. 新增文件
- `MESSAGE_SYNC_EXAMPLE.md`: Message 同步使用示例
- `test_message_sync.py`: Message 同步功能测试脚本
- `MESSAGE_SYNC_IMPLEMENTATION.md`: 本文档

## 核心功能

### 1. 创建 Message
```python
{
  "operation": "create",
  "session_id": "uuid",
  "role": "user",
  "parts": [
    {"type": "text", "content": "消息内容"}
  ]
}
```

### 2. 更新 Message
```python
{
  "operation": "update",
  "id": "uuid",
  "version": 1,
  "parts": [
    {"type": "text", "content": "更新后的内容"}
  ]
}
```

### 3. 删除 Message
```python
{
  "operation": "delete",
  "id": "uuid",
  "version": 1
}
```

### 4. 增量拉取
```python
{
  "last_sync_at": "2024-01-20T10:00:00Z",
  "include_messages": true,
  "limit": 100
}
```

## 关键特性

### 1. 用户隔离
- Message 通过 `session_id` 自动关联到 `user_id`
- 创建时验证 session 所有权
- 更新/删除时验证 message 所有权
- 用户只能访问自己的数据

### 2. 版本控制（乐观锁）
- 每个 Message 有 `version` 字段
- 创建时 `version = 1`
- 每次更新 `version++`
- 更新时验证版本号，防止并发冲突

### 3. 冲突解决策略
- **server_wins**: 服务器优先，检测到冲突时保留服务器数据
- **client_wins**: 客户端优先，强制覆盖（暂未实现）
- **fail**: 检测到冲突时操作失败，返回错误

### 4. 多模态支持
- Message 包含多个 MessagePart
- 支持类型：text、plain、image、url、json
- 每个 part 可以有 metadata 和 raw_data

### 5. 软删除
- 删除时只标记 `is_deleted = true`
- 保留数据历史
- 支持恢复（如需要）

## 数据流程

### Push 流程（客户端 → 服务器）
```
1. 客户端收集变更（create/update/delete）
2. 批量提交到 /api/v1/sync/batch
3. 服务器验证权限和版本
4. 执行操作（创建/更新/删除）
5. 返回结果（成功/失败/冲突）
```

### Pull 流程（服务器 → 客户端）
```
1. 客户端提供 last_sync_at 时间戳
2. 服务器查询 updated_at > last_sync_at 的记录
3. 返回变更数据（包括 parts）
4. 客户端更新本地数据
5. 保存新的 sync_timestamp
```

## 安全性

1. **认证**: 所有接口需要 Bearer Token
2. **授权**: 用户只能访问自己的数据
3. **验证**: 
   - Session 所有权验证
   - Topic 所有权验证（如指定）
   - 版本号验证
4. **隔离**: 通过 user_id 实现数据隔离

## 性能优化

1. **批量操作**: 减少网络请求
2. **增量同步**: 只传输变更数据
3. **索引优化**: user_id 字段已建立索引
4. **分页控制**: limit 参数限制单次拉取量
5. **建议**:
   - 图片等大文件使用 URL 而非 base64
   - 合理设置 limit（建议 100-500）
   - 考虑使用 WebSocket 替代轮询

## 测试

### 运行测试
```bash
# 确保服务运行
make dev

# 运行测试脚本
python test_message_sync.py
```

### 测试覆盖
- ✅ 创建 Message
- ✅ 创建多模态 Message（多个 parts）
- ✅ 更新 Message
- ✅ 删除 Message
- ✅ 增量拉取 Message
- ✅ 版本冲突检测
- ✅ 权限验证

## API 端点

### POST /api/v1/sync/batch
批量同步 Activity、Session、Topic、Message

**请求体**:
```json
{
  "activities": [...],
  "sessions": [...],
  "topics": [...],
  "messages": [...],
  "conflict_strategy": "server_wins"
}
```

**响应**:
```json
{
  "activities": [...],
  "sessions": [...],
  "topics": [...],
  "messages": [...],
  "total_operations": 10,
  "successful_operations": 9,
  "failed_operations": 1,
  "conflicts": 0,
  "sync_timestamp": "2024-01-20T10:00:00Z"
}
```

### POST /api/v1/sync/pull
增量拉取变更数据

**请求体**:
```json
{
  "last_sync_at": "2024-01-20T09:00:00Z",
  "include_activities": true,
  "include_sessions": true,
  "include_topics": true,
  "include_messages": true,
  "limit": 1000
}
```

**响应**:
```json
{
  "activities": [...],
  "sessions": [...],
  "topics": [...],
  "messages": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "topic_id": "uuid",
      "role": "user",
      "sender_id": null,
      "parts": [
        {
          "id": "uuid",
          "type": "text",
          "content": "消息内容",
          "metadata": null,
          "event_id": null,
          "raw_data": null,
          "created_at": "2024-01-20T09:30:00Z"
        }
      ],
      "version": 1,
      "created_at": "2024-01-20T09:30:00Z",
      "updated_at": "2024-01-20T09:30:00Z",
      "is_deleted": false
    }
  ],
  "has_more": false,
  "sync_timestamp": "2024-01-20T10:00:00Z",
  "next_cursor": null
}
```

## 注意事项

### 1. MessagePart 更新行为
更新 Message 时如果提供 `parts` 数组，会**完全替换**所有现有的 parts：
- 删除所有旧的 MessagePart
- 创建新的 MessagePart
- 如果只想更新 Message 的其他字段（如 role），不要提供 parts 参数

### 2. 生产环境迁移
在生产环境中执行迁移前，需要先为现有 Message 数据设置 user_id：

```sql
-- 通过 session 表关联设置 user_id
UPDATE message 
SET user_id = (SELECT user_id FROM session WHERE session.id = message.session_id)
WHERE user_id IS NULL;

-- 验证所有 message 都有 user_id
SELECT COUNT(*) FROM message WHERE user_id IS NULL;

-- 如果需要，可以将字段设置为 NOT NULL
-- ALTER TABLE message ALTER COLUMN user_id SET NOT NULL;
```

### 3. 版本号管理
- 客户端必须保存每个 Message 的 version
- 更新时必须提供正确的 version
- 版本不匹配时根据 conflict_strategy 处理

### 4. 性能考虑
- Message 的 parts 可能较大（特别是包含图片时）
- 建议使用 URL 而非 base64 存储大文件
- 合理设置 limit 参数避免单次拉取过多数据
- 考虑实现分页加载

## 后续优化建议

1. **WebSocket 支持**: 实现实时推送，替代轮询
2. **部分更新**: 支持只更新特定的 MessagePart
3. **压缩**: 对大量数据进行压缩传输
4. **缓存**: 实现客户端缓存策略
5. **离线支持**: 支持离线操作队列
6. **冲突解决**: 实现更智能的冲突解决策略

## 总结

Message 同步功能已完整实现并集成到现有的 Sync API 中，具备以下特点：

✅ 完整的 CRUD 操作支持
✅ 版本控制和冲突检测
✅ 用户数据隔离
✅ 多模态消息支持
✅ 批量操作和增量同步
✅ 软删除机制
✅ 完善的文档和测试

可以立即投入使用！
