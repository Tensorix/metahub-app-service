# IM 消息发送功能 - 快速开始

## 核心功能

✅ **自动判断 Session 类型**: pm/group 类型自动使用 IM 发送接口  
✅ **角色识别**: self 和 user 显示在右侧，null 和 assistant 显示在左侧  
✅ **配置支持**: Session 设置中可以关闭自动发送  
✅ **默认启用**: 新创建的 pm/group session 默认启用自动发送

## 快速使用

### 1. 创建 IM Session

```typescript
const session = await sessionApi.createSession({
  name: "测试私聊",
  type: "pm",  // 或 "group"
  source: "astr_qq",
  external_id: "qq_chat_123",
  metadata: {
    auto_send_im: true  // 默认值，可省略
  }
});
```

### 2. 发送消息

```typescript
// 在聊天界面直接发送，会自动判断类型
await useChatStore.getState().sendMessage("你好");
```

### 3. 关闭自动发送

在 Session 编辑对话框中：
1. 取消勾选"自动发送到 IM 平台"
2. 保存

或通过 API：

```typescript
await sessionApi.updateSession(sessionId, {
  metadata: {
    auto_send_im: false
  }
});
```

## 消息角色

| 角色 | 位置 | 说明 |
|------|------|------|
| `user` | 右侧 | 用户输入 |
| `self` | 右侧 | IM 发送 |
| `assistant` | 左侧 | AI 回复 |
| `null` | 左侧 | 外部用户 |

## 测试

```bash
# 运行测试
python test_im_send.py
```

## 注意事项

⚠️ 需要 IM Gateway 桥接连接  
⚠️ Session 需要配置 source 和 external_id  
⚠️ 发送失败会返回 503 错误

## 相关文档

- 详细说明: `IM_SEND_FEATURE.md`
- IM Gateway: `IM_GATEWAY_README.md`
- Webhook: `WEBHOOK_README.md`
