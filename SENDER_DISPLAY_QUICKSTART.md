# Sender 显示功能快速参考

## 快速测试

### 1. 测试后端 API

```bash
# 测试 API 是否返回 sender 信息
python test_sender_display.py
```

### 2. 测试导入适配器

```bash
# 测试 QQ 导入是否正确处理 sender
python test_qq_sender_name_fix.py
```

### 3. 启动服务

```bash
# 后端
uvicorn main:app --reload

# 前端
cd frontend
npm run dev
```

## 关键修改点

### 后端 (3 个文件)

1. **app/schema/session.py**
   ```python
   class MessageResponse(MessageBase):
       sender: Optional["MessageSenderResponse"] = None  # 新增
   ```

2. **app/service/session.py**
   ```python
   .options(joinedload(Message.sender))  # 预加载 sender
   ```

3. **app/router/v1/session.py**
   ```python
   if m.sender:
       msg_resp.sender = MessageSenderResponse.model_validate(m.sender)
   ```

### 前端 (3 个文件)

1. **frontend/src/lib/api.ts**
   ```typescript
   export interface Message {
       sender?: MessageSender;  // 新增
   }
   ```

2. **frontend/src/components/MessageList.tsx**
   ```typescript
   const senderName = message.sender?.name || '未知用户';
   ```

3. **frontend/src/components/chat/AIMessageList.tsx**
   ```typescript
   const senderName = message.sender?.name || '未知用户';
   ```

## API 响应示例

```json
{
  "items": [
    {
      "id": "019c281a-62c1-7748-8554-665fdca38ac5",
      "role": "null",
      "sender_id": "019c281a-6273-74ed-9bfd-1d7785937901",
      "sender": {
        "id": "019c281a-6273-74ed-9bfd-1d7785937901",
        "name": "沙音木偶",
        "external_id": "u_MxfQPkbxyHw4ci2QAhGYJQ",
        "created_at": "2026-02-04T10:02:23.688099Z"
      },
      "parts": [
        {
          "type": "text",
          "content": "@地瓜 又失效了[/捂脸]"
        }
      ]
    }
  ]
}
```

## 前端显示逻辑

```typescript
// 获取发送者名称的优先级
const getSenderName = () => {
  // 1. 优先从 sender 对象获取
  if (message.sender?.name) {
    return message.sender.name;
  }
  
  // 2. 备用：从 metadata 中获取
  if (message.parts[0]?.metadata?.sender_name) {
    return message.parts[0].metadata.sender_name;
  }
  
  // 3. 默认值
  if (isUserSide) return '我';
  if (isAssistant) return 'AI';
  if (isSystem) return '系统';
  return '未知用户';
};
```

## 常见问题

### Q: 为什么有些消息没有显示发送者名称？

A: 可能的原因：
1. 消息没有 `sender_id`（旧数据或 AI 对话）
2. 后端没有预加载 sender 关系
3. 前端没有正确获取 sender 信息

解决方法：
- 检查后端是否使用 `joinedload(Message.sender)`
- 检查前端是否正确访问 `message.sender?.name`
- 查看 API 响应是否包含 sender 对象

### Q: 旧数据怎么办？

A: 三种选择：
1. **重新导入**（推荐）- 使用修复后的导入适配器
2. **数据清理** - 编写脚本移除内容中的发送者名称前缀
3. **保持现状** - 新数据会正确显示，旧数据保持不变

### Q: 如何验证修改是否生效？

A: 检查清单：
- [ ] 运行 `test_sender_display.py` 通过
- [ ] API 响应包含 `sender` 对象
- [ ] 前端消息上方显示发送者名称
- [ ] 消息内容不包含发送者名称前缀

## 相关文档

- `QQ_IMPORT_SENDER_NAME_FIX.md` - QQ 导入问题修复
- `SENDER_DISPLAY_IMPLEMENTATION.md` - 完整实现文档
- `MESSAGE_SENDER_EXTERNAL_ID.md` - Sender external_id 功能

## 一键检查

```bash
# 检查后端修改
grep -n "sender: Optional" app/schema/session.py
grep -n "joinedload(Message.sender)" app/service/session.py

# 检查前端修改
grep -n "sender?: MessageSender" frontend/src/lib/api.ts
grep -n "message.sender?.name" frontend/src/components/MessageList.tsx
```

预期输出：
```
app/schema/session.py:119:    sender: Optional["MessageSenderResponse"] = None
app/service/session.py:239:        ).options(joinedload(Message.sender))
frontend/src/lib/api.ts:XXX:  sender?: MessageSender;
frontend/src/components/MessageList.tsx:XXX:      if (message.sender?.name) {
```

## 快速回滚

如果需要回滚修改：

```bash
# 后端
git checkout app/schema/session.py
git checkout app/service/session.py
git checkout app/router/v1/session.py

# 前端
git checkout frontend/src/lib/api.ts
git checkout frontend/src/components/MessageList.tsx
git checkout frontend/src/components/chat/AIMessageList.tsx
```
