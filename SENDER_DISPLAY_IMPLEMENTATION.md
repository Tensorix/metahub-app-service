# Sender 名称显示功能实现

## 概述

实现了在前端消息列表中显示发送者名称的功能，解决了 QQ Chat Exporter 导入后消息内容包含发送者名称的问题。

## 问题背景

在修复 QQ Chat Exporter 导入适配器后，消息内容不再包含发送者名称前缀。为了正确显示发送者信息，需要：

1. 后端 API 返回 sender 信息
2. 前端从 sender 对象中获取并显示发送者名称

## 实现方案

### 1. 后端修改

#### 1.1 Schema 更新 (`app/schema/session.py`)

添加 `MessageSenderResponse` 到 `MessageResponse`：

```python
class MessageResponse(MessageBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    parts: list[MessagePartResponse]
    sender: Optional["MessageSenderResponse"] = None  # ✅ 新增
```

#### 1.2 Service 更新 (`app/service/session.py`)

在 `MessageService.get_messages` 中预加载 sender 关系：

```python
def get_messages(db: Session, session_id: UUID, query: MessageListQuery):
    from sqlalchemy.orm import joinedload
    
    q = db.query(Message).filter(
        Message.session_id == session_id,
        Message.is_deleted == query.is_deleted
    ).options(joinedload(Message.sender))  # ✅ 预加载 sender
    
    # ... 其他查询逻辑
```

#### 1.3 Router 更新 (`app/router/v1/session.py`)

在返回消息列表时包含 sender 信息：

```python
@router.get("/sessions/{session_id}/messages")
def get_messages(...):
    messages, total = MessageService.get_messages(db, session_id, query)
    
    # 构建响应，包含 sender 信息
    items = []
    for m in messages:
        msg_resp = MessageResponse.model_validate(m)
        if m.sender:
            msg_resp.sender = MessageSenderResponse.model_validate(m.sender)
        items.append(msg_resp)
    
    return MessageListResponse(items=items, ...)
```

### 2. 前端修改

#### 2.1 类型定义更新 (`frontend/src/lib/api.ts`)

添加 `MessageSender` 接口并更新 `Message` 接口：

```typescript
export interface MessageSender {
  id: string;
  name: string;
  external_id?: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  topic_id?: string;
  role: string;
  sender_id?: string;
  sender?: MessageSender;  // ✅ 新增
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  parts: MessagePart[];
}
```

#### 2.2 MessageList 组件更新 (`frontend/src/components/MessageList.tsx`)

添加发送者名称显示逻辑：

```typescript
function MessageItem({ message, onDelete }) {
  // 获取发送者名称
  const getSenderName = () => {
    // 优先从 sender 对象获取
    if (message.sender?.name) {
      return message.sender.name;
    }
    // 备用：从 metadata 中获取
    if (message.parts[0]?.metadata?.sender_name) {
      return message.parts[0].metadata.sender_name;
    }
    // 默认值
    if (isUserSide) return '我';
    if (isAssistant) return 'AI';
    if (isSystem) return '系统';
    return '未知用户';
  };
  
  const senderName = getSenderName();

  return (
    <div>
      {/* 显示发送者名称 */}
      <div className="text-xs text-muted-foreground">
        {senderName}
      </div>
      
      {/* 消息内容 */}
      <div className="rounded-lg px-4 py-2">
        {/* ... */}
      </div>
    </div>
  );
}
```

#### 2.3 AI 聊天组件更新 (`frontend/src/components/chat/AIMessageList.tsx`)

同样的逻辑应用到 AI 聊天页面的消息列表。

## 数据流

```
1. 导入 QQ 聊天记录
   ↓
2. 创建 MessageSender 记录（name, external_id）
   ↓
3. 创建 Message 记录（sender_id 关联到 MessageSender）
   ↓
4. 前端请求消息列表
   ↓
5. 后端查询消息并预加载 sender 关系
   ↓
6. 返回包含 sender 对象的消息列表
   ↓
7. 前端从 sender.name 获取并显示发送者名称
```

## 显示优先级

前端获取发送者名称的优先级：

1. **message.sender.name** - 从 sender 对象获取（推荐）
2. **message.parts[0].metadata.sender_name** - 从 metadata 获取（备用）
3. **默认值** - 根据 role 返回默认名称

## 兼容性

### 向后兼容

- ✅ 旧数据（没有 sender_id）：显示默认名称或从 metadata 获取
- ✅ 新数据（有 sender_id）：显示 sender.name
- ✅ AI 对话：显示 "我" 和 "AI"
- ✅ 系统消息：显示 "系统"

### 数据迁移

对于已导入的旧数据（消息内容包含发送者名称前缀）：

1. **选项1**：重新导入数据（推荐）
2. **选项2**：编写数据清理脚本移除内容中的发送者名称前缀
3. **选项3**：保持现状，新导入的数据会正确显示

## 测试

### 后端测试

运行测试脚本验证 API 响应：

```bash
python test_sender_display.py
```

预期结果：
- ✅ API 返回包含 sender 对象的消息
- ✅ sender 对象包含 id, name, external_id 字段

### 前端测试

1. 启动前端开发服务器
2. 导航到会话详情页面
3. 检查消息列表是否显示发送者名称

预期结果：
- ✅ 每条消息上方显示发送者名称
- ✅ 用户消息显示在右侧，其他消息显示在左侧
- ✅ 发送者名称样式为小号灰色文字

## 相关文件

### 后端
- `app/schema/session.py` - Schema 定义
- `app/service/session.py` - Service 层
- `app/router/v1/session.py` - API 路由
- `app/db/model/message.py` - Message 模型
- `app/db/model/message_sender.py` - MessageSender 模型

### 前端
- `frontend/src/lib/api.ts` - API 类型定义
- `frontend/src/components/MessageList.tsx` - 消息列表组件
- `frontend/src/components/chat/AIMessageList.tsx` - AI 聊天消息列表

### 测试
- `test_sender_display.py` - 后端 API 测试
- `test_qq_sender_name_fix.py` - 导入适配器测试

## 效果展示

### 修改前
```
┌─────────────────────────────────┐
│ 沙音木偶: @地瓜 又失效了[/捂脸]  │  ← 发送者名称在内容中
└─────────────────────────────────┘
```

### 修改后
```
沙音木偶                           ← 发送者名称单独显示
┌─────────────────────────────────┐
│ @地瓜 又失效了[/捂脸]            │  ← 内容不包含发送者名称
└─────────────────────────────────┘
```

## 总结

这次修改实现了：

1. ✅ 后端 API 正确返回 sender 信息
2. ✅ 前端从 sender 对象获取并显示发送者名称
3. ✅ 消息内容保持纯净，不包含发送者名称
4. ✅ 支持多种数据源（QQ、微信、AI 对话等）
5. ✅ 向后兼容旧数据

发送者信息现在通过标准的数据库关系进行管理，前端可以灵活控制显示方式，提升了用户体验和代码可维护性。
