# Activity 排序功能接口集成文档

## 概述

本次改动为 Activity（活动）模块新增了**手动排序**能力。其他服务可以通过以下方式感知和使用该功能：

1. Activity 对象新增 `sort_order` 字段
2. 获取列表时默认按 `sort_order` 升序排列
3. 新增批量排序接口 `PATCH /api/v1/activities/reorder`

---

## 数据库迁移

在部署前需执行 Alembic 迁移，为 `activity` 表新增 `sort_order` 列：

```bash
alembic upgrade head
```

迁移内容：
- 新增 `sort_order INTEGER NOT NULL DEFAULT 0` 列
- 新增索引 `ix_activity_sort_order`

---

## 字段变更

### Activity 对象新增字段

所有返回 Activity 对象的接口（创建、查询、更新等）响应体中均包含新字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `sort_order` | `integer` | 排序序号，**数字越小越靠前**，默认为 `0` |

**示例响应（节选）：**

```json
{
  "id": "01944d3e-1234-7abc-8def-000000000001",
  "name": "跟进客户 A",
  "type": "follow_up",
  "status": "pending",
  "priority": 3,
  "sort_order": 0,
  ...
}
```

---

## 列表排序规则变更

`GET /api/v1/activities` 列表接口的默认排序规则由原来的：

```
priority DESC, created_at DESC
```

变更为：

```
sort_order ASC, priority DESC, created_at DESC
```

> **注意：** 如果所有记录的 `sort_order` 均为默认值 `0`（如历史存量数据），则退化为原先按 `priority` 和 `created_at` 排序的行为，**不产生破坏性变更**。

---

## 新增接口：批量更新排序

### `PATCH /api/v1/activities/reorder`

将按期望顺序排列的活动 ID 列表提交给服务端，服务端会将列表中第 `i` 个 ID 对应的活动的 `sort_order` 设置为 `i`（从 0 开始）。

#### 请求

**Headers：**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body：**

```json
{
  "ordered_ids": [
    "01944d3e-0000-7abc-8def-000000000003",
    "01944d3e-0000-7abc-8def-000000000001",
    "01944d3e-0000-7abc-8def-000000000002"
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ordered_ids` | `string[]` | ✅ | 按期望顺序排列的活动 ID 列表 |

#### 响应

**成功（200 OK）：**

```json
{
  "message": "排序已更新"
}
```

**失败示例：**

```json
{
  "detail": "更新排序失败: ..."
}
```

#### 行为说明

- 只更新属于当前登录用户且未被软删除的活动
- 不在 `ordered_ids` 中的活动的 `sort_order` 不受影响
- 若某个 ID 不属于当前用户，该条记录会被静默跳过（不报错）
- 操作为批量写入，建议在用户完成拖拽操作后一次性调用，避免频繁触发

---

## 创建 / 更新活动时显式指定排序

创建（`POST /api/v1/activities`）和更新（`PUT /api/v1/activities/{id}`）接口均支持直接传入 `sort_order` 字段：

**创建请求体示例：**

```json
{
  "name": "新任务",
  "type": "task",
  "status": "pending",
  "sort_order": 5
}
```

**更新请求体示例：**

```json
{
  "sort_order": 2
}
```

若不传 `sort_order`，创建时默认为 `0`。

---

## 前端实现参考

以下为前端调用排序接口的参考代码（TypeScript / Axios）：

```typescript
// 拖拽排序结束后调用
async function handleReorder(orderedIds: string[]) {
  // 1. 乐观更新本地状态
  setActivities(prev => {
    const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
    return prev.map(a => ({
      ...a,
      sort_order: orderMap.has(a.id) ? orderMap.get(a.id)! : a.sort_order,
    }));
  });

  // 2. 调用接口持久化
  try {
    await apiClient.patch('/api/v1/activities/reorder', {
      ordered_ids: orderedIds,
    });
  } catch (err) {
    // 回滚本地状态
    loadActivities();
  }
}
```

---

## 其他服务集成要点

### 如果你的服务会**读取** Activity 列表

- 响应中每条 Activity 现在带有 `sort_order: number` 字段
- 若你的反序列化模型是严格模式，请新增该字段；若使用宽松模式则无需修改

### 如果你的服务会**创建** Activity

- `sort_order` 为可选字段，不传则默认 `0`
- 若需要在特定位置插入，可先查询现有活动的 `sort_order`，然后传入合适的值

### 如果你的服务需要**维护自定义排序**

推荐工作流：

```
1. GET /api/v1/activities         → 获取当前列表（已按 sort_order 排序）
2. 用户/业务逻辑调整顺序
3. PATCH /api/v1/activities/reorder → 提交新顺序的 ID 列表
4. 下次 GET 时即按新顺序返回
```

---

## 兼容性说明

| 场景 | 影响 |
|------|------|
| 存量活动数据 | 所有历史数据 `sort_order` 均为 `0`，排序会退化为原先的 `priority + created_at` 逻辑，**不破坏现有行为** |
| 未升级的客户端 | 读取响应时忽略新字段即可；创建/更新时不传 `sort_order` 也完全兼容 |
| 未执行数据库迁移 | **服务将无法启动**，请确保在部署前运行 `alembic upgrade head` |
