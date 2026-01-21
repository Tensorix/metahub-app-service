# Event 用户隔离功能

## 概述

Event 接口现已支持用户隔离，确保每个用户只能访问和管理自己的事件数据。

## 修改内容

### 1. 数据库模型 (app/db/model/event.py)

添加了 `user_id` 字段：

```python
user_id: Mapped[UUID] = mapped_column(
    ForeignKey("user.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
    comment="所属用户ID"
)
```

### 2. 服务层 (app/service/event.py)

所有方法都添加了 `user_id` 参数进行用户隔离：

- `get_event(db, event_id, user_id)` - 根据 ID 获取事件（带用户隔离）
- `get_all_events(db, user_id, include_deleted)` - 获取所有事件（带用户隔离）

### 3. 路由层 (app/router/v1/event.py)

- 所有接口都需要用户认证（`current_user: User = Depends(get_current_user)`）
- 查询时自动过滤当前用户的数据

### 4. 实验性路由 (app/router/v1/experimental/event.py)

- `/events/ping` - 创建 ping 事件时自动关联当前用户
- `/events` - 查询事件时只返回当前用户的数据

### 5. 数据库迁移

创建了迁移文件 `8f5d92a6e104_add_user_id_to_event_table.py`：

```bash
alembic upgrade head
```

## API 变化

### 获取事件详情

```http
GET /api/v1/events/{event_id}
Authorization: Bearer <token>
```

- 只能获取当前用户的事件
- 如果事件不存在或不属于当前用户，返回 404

### 获取事件列表

```http
GET /api/v1/events?include_deleted=false
Authorization: Bearer <token>
```

- 只返回当前用户的事件列表
- 支持 `include_deleted` 参数控制是否包含已删除的事件

### 创建 Ping 事件

```http
POST /api/v1/events/ping
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "健康检查",
  "source": "monitoring_system",
  "timestamp": "2026-01-21T12:00:00Z"
}
```

- 自动关联当前用户
- 自动创建对应的 Activity（也关联到当前用户）

## 测试

运行测试脚本验证用户隔离功能：

```bash
python test_event_user_isolation.py
```

测试内容：
- 不同用户创建各自的事件
- 用户只能查询自己的事件列表
- 用户无法访问其他用户的事件
- DEBUG 模式下的功能测试

## 兼容性说明

### DEBUG 模式

在 DEBUG 模式下（`config.DEBUG=True`），所有请求都会使用固定的 debug 用户：

```python
DEBUG_USER = User(
    id=UUID("00000000-0000-0000-0000-000000000000"),
    username="debug_user",
    ...
)
```

### 现有数据

如果数据库中已有 Event 数据，需要：

1. 为现有数据设置 `user_id`（可以设置为默认用户或删除）
2. 取消迁移文件中的注释，将 `user_id` 设置为 NOT NULL：

```python
op.alter_column('event', 'user_id', nullable=False)
```

## 相关文件

- `app/db/model/event.py` - Event 模型
- `app/service/event.py` - Event 服务
- `app/router/v1/event.py` - Event 路由
- `app/router/v1/experimental/event.py` - 实验性 Event 路由
- `alembic/versions/8f5d92a6e104_add_user_id_to_event_table.py` - 数据库迁移
- `test_event_user_isolation.py` - 用户隔离测试

## 安全性

- 所有 Event 接口都需要用户认证
- 用户只能访问自己的数据
- 使用数据库级别的外键约束（CASCADE DELETE）
- 查询时自动过滤 `user_id`
