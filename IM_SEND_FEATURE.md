# IM 消息发送功能实现

## 功能概述

实现了前端私聊和群聊支持直接从 send 接口发送消息到 IM 平台，以及前端支持 `self` 角色识别和显示。

## 实现内容

### 1. 后端接口（无需修改）

后端已经实现了完整的 IM Gateway 发送接口：

- **接口**: `POST /api/v1/sessions/{session_id}/messages/send`
- **功能**: 
  - 存储消息到数据库（role=self）
  - 通过 WebSocket 桥接发送到 IM 平台
  - 等待桥接返回投递结果

### 2. 前端消息角色显示

修改了 `AIMessageList.tsx` 组件，支持多种角色显示：

- **右侧显示**（用户侧）：
  - `user`: 用户输入的消息
  - `self`: 通过 IM Gateway 发送的消息
  
- **左侧显示**（对方侧）：
  - `assistant`: AI 助手回复
  - `null`: 外部用户消息（来自 IM 平台）

### 3. 自动判断 Session 类型

在 `chat.ts` store 中实现了智能发送逻辑：

```typescript
// 判断是否是 IM 类型的 session（pm/group）且配置为自动发送
const isIMSession = session.type === 'pm' || session.type === 'group';
const autoSendIM = session.metadata?.auto_send_im !== false; // 默认 true

if (isIMSession && autoSendIM) {
  // 使用 IM 发送接口
  await get().sendIMMessage(content);
  return;
}

// 否则使用原有的消息创建逻辑
```

### 4. Session 配置支持

在 `SessionDialog.tsx` 中添加了配置选项：

- **配置字段**: `metadata.auto_send_im`
- **默认值**: `true`（新创建的 pm/group session 默认启用）
- **UI 位置**: Session 编辑对话框中，仅对 pm/group 类型显示
- **说明**: 启用后，发送的消息会直接通过 IM Gateway 发送到对应平台

## 使用流程

### 1. 创建 IM Session

```typescript
// 前端创建 pm/group session
const session = await sessionApi.createSession({
  name: "测试私聊",
  type: "pm",
  source: "astr_qq",
  metadata: {
    auto_send_im: true  // 启用自动发送（默认）
  }
});
```

### 2. 发送消息

```typescript
// 用户在聊天界面输入消息
// 如果是 pm/group 且 auto_send_im=true，会自动调用 IM 发送接口
await useChatStore.getState().sendMessage("你好");

// 内部会调用
await sessionApi.sendIMMessage(sessionId, {
  message: [{ type: 'text', text: '你好' }],
  message_str: '你好'
});
```

### 3. 消息显示

- 发送的消息会以 `role=self` 存储在数据库
- 前端显示时，`self` 和 `user` 角色都显示在右侧（用户侧）
- 来自 IM 平台的消息（`role=null`）显示在左侧（对方侧）

### 4. 配置管理

用户可以在 Session 设置中切换是否自动发送：

1. 打开 Session 编辑对话框
2. 找到"自动发送到 IM 平台"选项
3. 取消勾选后，消息会使用原有的创建接口（不发送到 IM）

## 消息角色说明

| 角色 | 显示位置 | 说明 |
|------|---------|------|
| `user` | 右侧 | 用户在 AI 对话中输入的消息 |
| `self` | 右侧 | 通过 IM Gateway 发送的消息 |
| `assistant` | 左侧 | AI 助手的回复 |
| `null` | 左侧 | 来自 IM 平台的外部用户消息 |
| `system` | 左侧 | 系统消息 |

## API 接口

### 发送 IM 消息

```http
POST /api/v1/sessions/{session_id}/messages/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "message": [
    {
      "type": "text",
      "text": "消息内容"
    }
  ],
  "message_str": "消息内容"
}
```

**响应**:

```json
{
  "success": true,
  "message_id": "uuid",
  "bridge_result": {},
  "error": null
}
```

**错误码**:
- `404`: Session 不存在
- `400`: Session 没有配置 source 或 external_id
- `503`: IM Gateway 桥接未连接
- `504`: 桥接响应超时

## 前端 API

### sessionApi.sendIMMessage

```typescript
await sessionApi.sendIMMessage(sessionId, {
  message: [{ type: 'text', text: '消息内容' }],
  message_str: '消息内容'
});
```

### useChatStore.sendMessage

```typescript
// 自动判断 session 类型并选择发送方式
await useChatStore.getState().sendMessage('消息内容');
```

### useChatStore.sendIMMessage

```typescript
// 直接使用 IM 发送接口
await useChatStore.getState().sendIMMessage('消息内容');
```

## 测试

运行测试脚本：

```bash
python test_im_send.py
```

测试内容：
1. 创建 pm 类型的 session
2. 发送 IM 消息
3. 验证消息存储为 role=self
4. 更新 session 配置
5. 清理测试数据

## 注意事项

1. **IM Gateway 连接**: 发送消息前需要确保对应的 IM Gateway 桥接已连接
2. **Session 配置**: 需要正确配置 `source` 和 `external_id` 字段
3. **默认行为**: 新创建的 pm/group session 默认启用自动发送
4. **兼容性**: 不影响现有的 AI 对话功能和普通消息创建

## 文件修改清单

### 前端

- `frontend/src/components/chat/AIMessageList.tsx`: 支持 self 和 null 角色显示
- `frontend/src/lib/api.ts`: 添加 sendIMMessage API
- `frontend/src/store/chat.ts`: 添加自动判断和 IM 发送逻辑
- `frontend/src/components/SessionDialog.tsx`: 添加 auto_send_im 配置选项

### 测试

- `test_im_send.py`: IM 发送功能测试脚本

### 文档

- `IM_SEND_FEATURE.md`: 功能说明文档

## 后续优化建议

1. **错误提示**: 在前端添加更友好的错误提示（桥接未连接、发送失败等）
2. **发送状态**: 显示消息发送状态（发送中、已送达、失败）
3. **重试机制**: 发送失败时支持重试
4. **批量发送**: 支持批量发送多条消息
5. **消息撤回**: 支持撤回已发送的消息
