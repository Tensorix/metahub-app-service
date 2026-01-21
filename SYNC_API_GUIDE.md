# Sync API 使用指南

## 概述

Sync API 提供了 Activity、Session、Topic、Message 的批量同步功能，支持：

- **版本管理**：使用乐观锁机制防止并发冲突
- **用户隔离**：所有数据自动限制在当前用户范围内
- **批量操作**：支持批量创建、更新、删除
- **增量同步**：支持基于时间戳的增量拉取
- **多模态消息**：Message 支持多个 MessagePart（文本、图片、URL等）

## 核心概念

### 1. 版本控制（Optimistic Locking）

每个实体都有一个 `version` 字段，用于实现乐观锁：

- 创建时 `version` 初始化为 1
- 每次更新操作 `version` 自动递增
- 客户端提供 `version` 字段进行冲突检测
- 如果版本不匹配，根据冲突策略处理

### 2. 用户隔离

所有接口都需要认证，数据自动限制在当前登录用户范围内：

- 创建时自动关联 `user_id`
- 查询时自动过滤 `user_id`
- 无法访问其他用户的数据

### 3. 冲突解决策略

- **server_wins**：服务器优先，客户端数据过期时不更新
- **client_wins**：客户端优先，强制覆盖服务器数据
- **fail**：检测到冲突时操作失败，返回错误

## API 端点

### 1. 批量同步 (Push)

**POST** `/api/v1/sync/batch`

批量推送客户端的变更到服务器。

#### 请求示例

```json
{
  "activities": [
    {
      "operation": "create",
      "type": "task",
      "name": "新任务",
      "priority": 5,
      "status": "pending"
    }
  ],
  "sessions": [
    {
      "operation": "create",
      "name": "新会话",
      "type": "ai"
    }
  ],
  "topics": [
    {
      "operation": "create",
      "name": "新话题",
      "session_id": "770e8400-e29b-41d4-a716-446655440000"
    }
  ],
  "messages": [
    {
      "operation": "create",
      "session_id": "770e8400-e29b-41d4-a716-446655440000",
      "topic_id": "880e8400-e29b-41d4-a716-446655440000",
      "role": "user",
      "parts": [
        {
          "type": "text",
          "content": "你好，这是一条消息"
        },
        {
          "type": "image",
          "content": "base64_encoded_image_data",
          "metadata": {
            "width": 800,
            "height": 600
          }
        }
      ]
    },
    {
      "operation": "update",
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "role": "assistant",
      "version": 2,
      "parts": [
        {
          "type": "text",
          "content": "更新后的回复内容"
        }
      ]
    },
    {
      "operation": "delete",
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "version": 1
    }
  ],
  "conflict_strategy": "server_wins"
}
```

#### 响应示例

```json
{
  "activities": [...],
  "sessions": [...],
  "topics": [...],
  "messages": [
    {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "operation": "create",
      "success": true,
      "conflict": false,
      "version": 1,
      "server_updated_at": "2024-01-20T10:05:00Z"
    },
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "operation": "update",
      "success": true,
      "conflict": false,
      "version": 3,
      "server_updated_at": "2024-01-20T10:05:01Z"
    }
  ],
  "total_operations": 6,
  "successful_operations": 6,
  "failed_operations": 0,
  "conflicts": 0,
  "sync_timestamp": "2024-01-20T10:05:00Z"
}
```

### 2. 增量拉取 (Pull)

**POST** `/api/v1/sync/pull`

从服务器拉取变更数据。

#### 请求示例

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

#### 响应示例

```json
{
  "activities": [...],
  "sessions": [...],
  "topics": [...],
  "messages": [
    {
      "id": "990e8400-e29b-41d4-a716-446655440000",
      "session_id": "770e8400-e29b-41d4-a716-446655440000",
      "topic_id": "880e8400-e29b-41d4-a716-446655440000",
      "role": "user",
      "sender_id": null,
      "parts": [
        {
          "id": "bb0e8400-e29b-41d4-a716-446655440000",
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
  "sync_timestamp": "2024-01-20T10:05:00Z",
  "next_cursor": null
}
```

## 同步流程

### Message 同步特殊说明

Message 是一个复合实体，包含多个 MessagePart 子对象：

- **MessagePart**：消息的内容部分，支持多模态（文本、图片、URL、JSON等）
- 一个 Message 可以包含多个 MessagePart
- 创建 Message 时必须提供至少一个 part
- 更新 Message 时如果提供 parts 数组，会**完全替换**现有的所有 parts
- Message 通过 session_id 自动关联到 user_id，确保用户隔离

**MessagePart 类型：**
- `text`: 纯文本
- `plain`: 纯文本（无格式）
- `image`: 图片（base64 或 URL）
- `url`: 链接
- `json`: JSON 数据

**示例：创建多模态消息**
```json
{
  "operation": "create",
  "session_id": "xxx",
  "role": "user",
  "parts": [
    {
      "type": "text",
      "content": "请看这张图片："
    },
    {
      "type": "image",
      "content": "data:image/png;base64,iVBORw0KG...",
      "metadata": {
        "filename": "screenshot.png",
        "size": 102400
      }
    },
    {
      "type": "text",
      "content": "这是什么？"
    }
  ]
}
```

### 典型的双向同步流程

```
1. 客户端启动
   ↓
2. Pull: 拉取服务器最新数据
   ↓
3. 合并本地变更
   ↓
4. Push: 推送本地变更到服务器
   ↓
5. 处理冲突
   ↓
6. 定期重复步骤 2-5
```

### 冲突处理示例

#### 场景：客户端和服务器都修改了同一条记录

**客户端状态：**
- Activity ID: `abc-123`
- version: 2
- name: "客户端修改的名称"

**服务器状态：**
- Activity ID: `abc-123`
- version: 3
- name: "服务器修改的名称"

**使用 server_wins 策略：**
```json
{
  "activities": [
    {
      "operation": "update",
      "id": "abc-123",
      "name": "客户端修改的名称",
      "version": 2
    }
  ],
  "conflict_strategy": "server_wins"
}
```

**响应：**
```json
{
  "activities": [
    {
      "id": "abc-123",
      "operation": "update",
      "success": true,
      "conflict": true,
      "version": 3,
      "server_updated_at": "2024-01-20T10:00:00Z"
    }
  ]
}
```

客户端应该：
1. 检测到 `conflict: true`
2. 使用 Pull API 获取服务器最新数据
3. 更新本地数据为服务器版本

## 最佳实践

### 1. 版本号管理

```typescript
// 客户端保存版本号
interface LocalActivity {
  id: string;
  name: string;
  version: number;  // 从服务器获取的版本号
  // ... 其他字段
}

// 更新时提供版本号
const updateRequest = {
  operation: "update",
  id: activity.id,
  name: newName,
  version: activity.version  // 使用本地保存的版本号
};
```

### 2. 增量同步

```typescript
// 保存上次同步时间
let lastSyncAt = localStorage.getItem('lastSyncAt');

// 拉取增量数据
const pullRequest = {
  last_sync_at: lastSyncAt,
  include_activities: true,
  include_sessions: true,
  include_topics: true,
  limit: 1000
};

const response = await fetch('/api/v1/sync/pull', {
  method: 'POST',
  body: JSON.stringify(pullRequest)
});

// 更新同步时间
localStorage.setItem('lastSyncAt', response.sync_timestamp);
```

### 3. 批量操作

```typescript
// 收集所有待同步的变更
const pendingChanges = {
  activities: [
    ...newActivities.map(a => ({ operation: 'create', ...a })),
    ...updatedActivities.map(a => ({ operation: 'update', ...a })),
    ...deletedActivities.map(a => ({ operation: 'delete', id: a.id }))
  ],
  sessions: [...],
  topics: [...],
  messages: [
    // 创建新消息
    {
      operation: 'create',
      session_id: sessionId,
      topic_id: topicId,
      role: 'user',
      parts: [
        { type: 'text', content: '消息内容' }
      ]
    },
    // 更新消息（注意：parts 会完全替换）
    {
      operation: 'update',
      id: messageId,
      version: 2,
      parts: [
        { type: 'text', content: '更新后的内容' }
      ]
    }
  ],
  conflict_strategy: 'server_wins'
};

// 一次性推送所有变更
const response = await fetch('/api/v1/sync/batch', {
  method: 'POST',
  body: JSON.stringify(pendingChanges)
});

// 处理结果
response.messages.forEach(result => {
  if (!result.success) {
    console.error(`Failed to sync message ${result.id}: ${result.error}`);
  }
  if (result.conflict) {
    console.warn(`Conflict detected for message ${result.id}`);
    // 拉取最新数据
  }
});
```

### 4. Message 同步示例

```typescript
// 创建包含多个 parts 的消息
const createMessage = {
  operation: 'create',
  session_id: 'session-uuid',
  topic_id: 'topic-uuid',
  role: 'user',
  parts: [
    {
      type: 'text',
      content: '请帮我分析这段代码：'
    },
    {
      type: 'plain',
      content: 'function hello() { console.log("Hello"); }',
      metadata: {
        language: 'javascript'
      }
    }
  ]
};

// 更新消息（完全替换 parts）
const updateMessage = {
  operation: 'update',
  id: 'message-uuid',
  version: 1,
  parts: [
    {
      type: 'text',
      content: '更新后的完整内容'
    }
  ]
};

// 同步
const response = await fetch('/api/v1/sync/batch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    messages: [createMessage, updateMessage],
    conflict_strategy: 'server_wins'
  })
});

const result = await response.json();
console.log('Sync result:', result);
```

### 5. 错误处理

```typescript
try {
  const response = await syncBatch(changes);
  
  // 检查失败的操作
  const failures = [
    ...response.activities,
    ...response.sessions,
    ...response.topics
  ].filter(r => !r.success);
  
  if (failures.length > 0) {
    // 记录失败的操作，稍后重试
    saveFailedOperations(failures);
  }
  
  // 检查冲突
  const conflicts = [
    ...response.activities,
    ...response.sessions,
    ...response.topics
  ].filter(r => r.conflict);
  
  if (conflicts.length > 0) {
    // 拉取最新数据解决冲突
    await pullLatestData();
  }
  
} catch (error) {
  // 网络错误或服务器错误
  console.error('Sync failed:', error);
  // 稍后重试
}
```

## 数据库迁移

添加 user_id 和 version 字段的迁移已创建：

```bash
# 运行迁移
alembic upgrade head

# 如果需要回滚
alembic downgrade -1
```

**注意**：
- Message 表已添加 `user_id` 和 `version` 字段
- 在生产环境中，需要先为现有 Message 数据设置 user_id 值（通过 session 表关联）
- 可以运行以下 SQL 更新现有数据：
  ```sql
  UPDATE message 
  SET user_id = (SELECT user_id FROM session WHERE session.id = message.session_id)
  WHERE user_id IS NULL;
  ```
- 然后再将字段设置为 NOT NULL（如需要）

## Message 同步注意事项

1. **用户隔离**：Message 通过 session_id 关联到 user_id，创建时会自动验证 session 所有权
2. **MessagePart 管理**：
   - 创建 Message 时必须提供 parts 数组
   - 更新 Message 时如果提供 parts，会删除所有旧的 parts 并创建新的
   - 如果只想更新 Message 的其他字段（如 role），不要提供 parts 参数
3. **版本控制**：Message 和其他实体一样支持版本控制，每次更新 version 自动递增
4. **软删除**：删除 Message 时只标记 is_deleted=true，不会真正删除数据
5. **关联验证**：
   - 创建/更新时会验证 session_id 是否属于当前用户
   - 如果指定 topic_id，会验证 topic 是否属于当前用户

## 性能优化建议

- 使用批量操作减少网络请求
- 增量同步减少数据传输量
- Message 的 parts 可能较大，建议：
  - 图片等大文件使用 URL 而非 base64
  - 设置合理的 limit 参数（建议 100-500）
  - 考虑分批拉取 Message 数据
