# Message 同步快速参考

## API 端点

```
POST /api/v1/sync/batch   # 批量同步（Push）
POST /api/v1/sync/pull    # 增量拉取（Pull）
```

## 操作类型

| 操作 | 说明 | 必需字段 |
|------|------|----------|
| `create` | 创建消息 | `session_id`, `role`, `parts` |
| `update` | 更新消息 | `id`, `version` |
| `delete` | 删除消息 | `id`, `version` |

## MessagePart 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `text` | 富文本 | Markdown、HTML |
| `plain` | 纯文本 | 代码、日志 |
| `image` | 图片 | base64 或 URL |
| `url` | 链接 | https://... |
| `json` | JSON数据 | 结构化数据 |

## 快速示例

### 创建消息
```json
{
  "messages": [{
    "operation": "create",
    "session_id": "xxx",
    "role": "user",
    "parts": [
      {"type": "text", "content": "你好"}
    ]
  }]
}
```

### 更新消息
```json
{
  "messages": [{
    "operation": "update",
    "id": "xxx",
    "version": 1,
    "parts": [
      {"type": "text", "content": "更新"}
    ]
  }]
}
```

### 删除消息
```json
{
  "messages": [{
    "operation": "delete",
    "id": "xxx",
    "version": 1
  }]
}
```

### 拉取消息
```json
{
  "last_sync_at": "2024-01-20T10:00:00Z",
  "include_messages": true,
  "limit": 100
}
```

## 冲突策略

| 策略 | 行为 |
|------|------|
| `server_wins` | 服务器优先（推荐） |
| `client_wins` | 客户端优先 |
| `fail` | 失败并返回错误 |

## 响应字段

```typescript
{
  id: UUID,           // 消息ID
  operation: string,  // 操作类型
  success: boolean,   // 是否成功
  error?: string,     // 错误信息
  conflict: boolean,  // 是否冲突
  version: number,    // 新版本号
  server_updated_at: datetime  // 服务器更新时间
}
```

## 注意事项

⚠️ **更新 parts 会完全替换**
- 提供 parts 数组会删除所有旧的 parts
- 只更新其他字段时不要提供 parts

⚠️ **版本号必须正确**
- 更新/删除时必须提供当前 version
- 版本不匹配会触发冲突检测

⚠️ **用户隔离**
- Message 通过 session 自动关联 user_id
- 只能操作自己的数据

⚠️ **性能优化**
- 大文件使用 URL 而非 base64
- 合理设置 limit（建议 100-500）
- 考虑使用批量操作

## 错误处理

```typescript
const result = await syncMessages(messages);

result.messages.forEach(msg => {
  if (!msg.success) {
    console.error(`失败: ${msg.error}`);
  }
  if (msg.conflict) {
    console.warn(`冲突: 需要重新拉取`);
    // 重新拉取最新数据
  }
});
```

## 测试命令

```bash
# 运行测试
python test_message_sync.py

# 查看文档
cat MESSAGE_SYNC_EXAMPLE.md
```
