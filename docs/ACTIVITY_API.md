# Activity API 文档

## 概述

Activity API 提供了完整的活动管理功能，包括创建、查询、更新和删除活动。支持软删除、分页查询、条件筛选等功能。

**🎯 特殊功能：当创建类型为 "ping" 的 Event 时，系统会自动创建一个对应的 "ping" 类型的 Activity。**

## 数据库表结构

```sql
CREATE TABLE activity (
  id UUID PRIMARY KEY,
  type VARCHAR(100) NOT NULL COMMENT '活动类型',
  name VARCHAR(255) NOT NULL COMMENT '活动名称',
  priority INTEGER DEFAULT 0 NOT NULL COMMENT '优先级，数字越大优先级越高',
  comments TEXT COMMENT '备注',
  tags TEXT[] COMMENT '标签列表',
  source_type VARCHAR(50) COMMENT '来源类型，如 manual/event/topic',
  source_id VARCHAR(255) COMMENT '来源ID',
  relation_ids TEXT[] COMMENT '关联ID列表',
  status VARCHAR(20) DEFAULT 'pending' NOT NULL COMMENT '状态: pending/active/done/dismissed',
  remind_at TIMESTAMPTZ COMMENT '提醒时间',
  due_date TIMESTAMPTZ COMMENT '截止日期',
  created_at TIMESTAMPTZ DEFAULT timezone('UTC', now()) NOT NULL COMMENT '创建时间',
  updated_at TIMESTAMPTZ DEFAULT timezone('UTC', now()) NOT NULL COMMENT '更新时间',
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL COMMENT '是否删除'
);

CREATE TABLE activity_relation (
  id UUID PRIMARY KEY,
  activity_id UUID REFERENCES activity(id) NOT NULL COMMENT '关联的活动ID',
  target_type VARCHAR(50) NOT NULL COMMENT '目标类型',
  target_id VARCHAR(255) NOT NULL COMMENT '目标ID',
  created_at TIMESTAMPTZ DEFAULT timezone('UTC', now()) NOT NULL COMMENT '创建时间',
  updated_at TIMESTAMPTZ DEFAULT timezone('UTC', now()) NOT NULL COMMENT '更新时间',
  is_deleted BOOLEAN DEFAULT FALSE NOT NULL COMMENT '是否删除'
);
```

## API 接口

### 1. 创建活动

**POST** `/api/v1/activities`

**请求体：**
```json
{
  "type": "meeting",
  "name": "团队周会",
  "priority": 5,
  "comments": "讨论本周工作进展",
  "tags": ["会议", "团队", "周会"],
  "source_type": "manual",
  "source_id": null,
  "relation_ids": [],
  "status": "pending",
  "remind_at": "2026-01-08T10:00:00Z",
  "due_date": "2026-01-08T11:00:00Z"
}
```

**响应：**
```json
{
  "code": "200",
  "message": "活动创建成功",
  "data": {
    "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
    "type": "meeting",
    "name": "团队周会",
    "priority": 5,
    "comments": "讨论本周工作进展",
    "tags": ["会议", "团队", "周会"],
    "source_type": "manual",
    "source_id": null,
    "relation_ids": [],
    "status": "pending",
    "remind_at": "2026-01-08T10:00:00Z",
    "due_date": "2026-01-08T11:00:00Z",
    "created_at": "2026-01-07T16:48:55Z",
    "updated_at": "2026-01-07T16:48:55Z",
    "is_deleted": false
  }
}
```

### 2. 获取活动详情

**GET** `/api/v1/activities/{activity_id}`

**响应：**
```json
{
  "code": "200",
  "message": "获取成功",
  "data": {
    "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
    "type": "meeting",
    "name": "团队周会",
    // ... 其他字段
  }
}
```

### 3. 获取活动列表

**GET** `/api/v1/activities`

**查询参数：**
- `page`: 页码（默认：1）
- `size`: 每页数量（默认：10，最大：100）
- `type`: 按类型筛选
- `priority_min`: 最小优先级
- `priority_max`: 最大优先级
- `tags`: 按标签筛选（数组，匹配任意标签）
- `is_deleted`: 是否包含已删除的记录（默认：false）

**示例请求：**
```
GET /api/v1/activities?page=1&size=10&type=meeting&priority_min=5
```

**响应：**
```json
{
  "code": "200",
  "message": "获取成功",
  "data": {
    "items": [
      {
        "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
        "type": "meeting",
        "name": "团队周会",
        // ... 其他字段
      }
    ],
    "total": 1,
    "page": 1,
    "size": 10,
    "pages": 1
  }
}
```

### 4. 更新活动

**PUT** `/api/v1/activities/{activity_id}`

**请求体：**
```json
{
  "name": "团队周会（已更新）",
  "priority": 8,
  "comments": "更新：增加项目进度汇报环节"
}
```

**响应：**
```json
{
  "code": "200",
  "message": "更新成功",
  "data": {
    "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
    "name": "团队周会（已更新）",
    "priority": 8,
    // ... 其他字段
  }
}
```

### 5. 删除活动

**DELETE** `/api/v1/activities/{activity_id}`

**查询参数：**
- `hard_delete`: 是否硬删除（默认：false，即软删除）

**响应：**
```json
{
  "code": "200",
  "message": "删除成功"
}
```

### 6. 恢复已删除的活动

**POST** `/api/v1/activities/{activity_id}/restore`

**响应：**
```json
{
  "code": "200",
  "message": "恢复成功",
  "data": {
    "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
    "is_deleted": false,
    // ... 其他字段
  }
}
```

## Ping Event 自动创建 Activity

### 功能说明

当通过 `/api/v1/events/ping` 接口创建 ping event 时，系统会自动创建一个对应的 ping 类型的 activity。

### Ping Event 接口

**POST** `/api/v1/events/ping`

**请求体：**
```json
{
  "name": "系统健康检查",
  "source": "monitoring_system",
  "timestamp": "2026-01-07T16:48:55Z"
}
```

**响应：**
```json
{
  "event": {
    "type": "ping",
    "raw_data": {
      "name": "系统健康检查",
      "source": "monitoring_system",
      "timestamp": "2026-01-07T16:48:55Z"
    },
    "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50"
  },
  "activity": {
    "id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
    "name": "Ping: 系统健康检查",
    "type": "ping",
    "source_type": "event",
    "source_id": "018d6b4a-4b6c-7c9a-9a6b-8f1c2d3e4f50",
    "priority": 1,
    "tags": ["ping", "auto-created"]
  }
}
```

### 自动创建规则

1. **Activity 名称生成规则：**
   - 如果 ping event 数据中包含 `name` 字段：`"Ping: {name}"`
   - 如果不包含 `name` 字段：`"Ping Activity - {event_id}"`

2. **默认属性：**
   - `type`: "ping"
   - `source_type`: "event"
   - `source_id`: 关联的 ping event ID
   - `priority`: 1（ping 活动默认优先级）
   - `status`: "pending"
   - `comments`: "Auto-created from ping event {event_id}"
   - `tags`: ["ping", "auto-created"]

3. **扩展性：**
   - 支持其他事件类型的自动创建（alert、notification、reminder 等）
   - 不同事件类型有不同的默认优先级

## 部署和运行

### 1. 应用数据库迁移

```bash
alembic upgrade head
```

### 2. 启动服务

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问 API 文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 4. 运行测试

```bash
# 测试 Activity API
python test_activity_api.py

# 测试 Ping Event 自动创建 Activity 功能
python test_ping_event_activity.py
```

## 特性

- ✅ 完整的 CRUD 操作
- ✅ 软删除和恢复功能
- ✅ 分页查询
- ✅ 多条件筛选
- ✅ 优先级排序
- ✅ 标签数组匹配
- ✅ 时间字段支持（提醒时间、截止日期）
- ✅ 灵活的来源追踪（source_type/source_id）
- ✅ 活动状态管理（pending/active/done/dismissed）
- ✅ 关联关系管理（activity_relation表）
- ✅ UUID v7 主键
- ✅ 统一的响应格式
- ✅ 完整的错误处理
- ✅ API 文档自动生成
- ✅ **Ping Event 自动创建对应 Activity**
- ✅ **支持多种事件类型的自动 Activity 创建**

## 错误码

- `200`: 操作成功
- `404`: 资源不存在
- `500`: 服务器内部错误