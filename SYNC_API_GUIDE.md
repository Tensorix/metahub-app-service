# Sync API 使用指南

## 概述

Sync API 提供了 Activity、Session、Topic 的批量同步功能，支持：

- **版本管理**：使用乐观锁机制防止并发冲突
- **用户隔离**：所有数据自动限制在当前用户范围内
- **批量操作**：支持批量创建、更新、删除
- **增量同步**：支持基于时间戳的增量拉取

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
    },
    {
      "operation": "update",
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "更新后的任务名称",
      "version": 3,
      "client_updated_at": "2024-01-20T10:00:00Z"
    },
    {
      "operation": "delete",
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "version": 2
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
  "conflict_strategy": "server_wins"
}
```

#### 响应示例

```json
{
  "activities": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "operation": "create",
      "success": true,
      "conflict": false,
      "version": 1,
      "server_updated_at": "2024-01-20T10:05:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "operation": "update",
      "success": true,
      "conflict": true,
      "version": 3,
      "server_updated_at": "2024-01-20T10:03:00Z"
    }
  ],
  "sessions": [...],
  "topics": [...],
  "total_operations": 5,
  "successful_operations": 4,
  "failed_operations": 1,
  "conflicts": 1,
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
  "limit": 1000
}
```

#### 响应示例

```json
{
  "activities": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "task",
      "name": "任务名称",
      "priority": 5,
      "status": "pending",
      "version": 3,
      "created_at": "2024-01-20T09:30:00Z",
      "updated_at": "2024-01-20T10:00:00Z",
      "is_deleted": false
    }
  ],
  "sessions": [...],
  "topics": [...],
  "has_more": false,
  "sync_timestamp": "2024-01-20T10:05:00Z",
  "next_cursor": null
}
```

## 同步流程

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
  conflict_strategy: 'server_wins'
};

// 一次性推送所有变更
const response = await fetch('/api/v1/sync/batch', {
  method: 'POST',
  body: JSON.stringify(pendingChanges)
});

// 处理结果
response.activities.forEach(result => {
  if (!result.success) {
    console.error(`Failed to sync activity ${result.id}: ${result.error}`);
  }
  if (result.conflict) {
    console.warn(`Conflict detected for activity ${result.id}`);
    // 拉取最新数据
  }
});
```

### 4. 错误处理

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

**注意**：在生产环境中，需要先为现有数据设置 user_id 值，然后再将字段设置为 NOT NULL。

## 安全性

- 所有接口都需要认证（Bearer Token）
- 用户只能访问自己的数据
- 版本控制防止并发修改冲突
- 软删除保留数据历史

## 性能优化

- 使用批量操作减少网络请求
- 增量同步减少数据传输量
- 索引优化（user_id 字段已建立索引）
- 分页控制（limit 参数）
