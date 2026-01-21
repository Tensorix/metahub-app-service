# Message 同步使用示例

## 快速开始

Message 同步已集成到现有的 Sync API 中，支持创建、更新、删除操作。

## 基本概念

### Message 结构

```typescript
interface Message {
  id: UUID;
  user_id: UUID;        // 自动关联（通过 session）
  session_id: UUID;     // 所属会话
  topic_id?: UUID;      // 所属话题（可选）
  role: string;         // user/assistant/system
  sender_id?: UUID;     // 发送者ID（可选）
  parts: MessagePart[]; // 消息内容部分
  version: number;      // 版本号
  created_at: datetime;
  updated_at: datetime;
  is_deleted: boolean;
}

interface MessagePart {
  id: UUID;
  type: string;         // text/plain/image/url/json
  content: string;      // 内容
  metadata?: object;    // 扩展元数据
  event_id?: string;    // 关联事件ID
  raw_data?: object;    // 原始数据
}
```

## 使用示例

### 1. 创建单条文本消息

```typescript
const response = await fetch('/api/v1/sync/batch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      {
        operation: 'create',
        session_id: 'your-session-uuid',
        role: 'user',
        parts: [
          {
            type: 'text',
            content: '你好，这是一条消息'
          }
        ]
      }
    ],
    conflict_strategy: 'server_wins'
  })
});

const result = await response.json();
console.log('Message ID:', result.messages[0].id);
console.log('Version:', result.messages[0].version);
```

### 2. 创建多模态消息

```typescript
// 包含文本 + 代码 + 图片的消息
const multiModalMessage = {
  operation: 'create',
  session_id: sessionId,
  topic_id: topicId,
  role: 'user',
  parts: [
    {
      type: 'text',
      content: '请帮我分析这段代码：'
    },
    {
      type: 'plain',
      content: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`,
      metadata: {
        language: 'javascript',
        filename: 'fibonacci.js'
      }
    },
    {
      type: 'text',
      content: '这是运行结果的截图：'
    },
    {
      type: 'image',
      content: 'https://example.com/screenshot.png',
      metadata: {
        width: 1920,
        height: 1080
      }
    }
  ]
};

await syncMessages([multiModalMessage]);
```

### 3. 更新消息

```typescript
// 注意：更新时提供 parts 会完全替换所有现有的 parts
const updateMessage = {
  operation: 'update',
  id: messageId,
  version: currentVersion,  // 必须提供当前版本号
  parts: [
    {
      type: 'text',
      content: '这是更新后的完整内容'
    }
  ]
};

const response = await fetch('/api/v1/sync/batch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [updateMessage],
    conflict_strategy: 'server_wins'
  })
});

const result = await response.json();
if (result.messages[0].conflict) {
  console.warn('检测到冲突，需要重新拉取最新数据');
}
```

### 4. 删除消息

```typescript
const deleteMessage = {
  operation: 'delete',
  id: messageId,
  version: currentVersion
};

await fetch('/api/v1/sync/batch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [deleteMessage],
    conflict_strategy: 'server_wins'
  })
});
```

### 5. 批量同步消息

```typescript
// 一次性同步多条消息
const batchSync = {
  messages: [
    // 创建用户消息
    {
      operation: 'create',
      session_id: sessionId,
      role: 'user',
      parts: [{ type: 'text', content: '问题1' }]
    },
    // 创建 AI 回复
    {
      operation: 'create',
      session_id: sessionId,
      role: 'assistant',
      parts: [{ type: 'text', content: '回答1' }]
    },
    // 更新之前的消息
    {
      operation: 'update',
      id: oldMessageId,
      version: 2,
      parts: [{ type: 'text', content: '修正后的内容' }]
    },
    // 删除某条消息
    {
      operation: 'delete',
      id: deleteMessageId,
      version: 1
    }
  ],
  conflict_strategy: 'server_wins'
};

const response = await fetch('/api/v1/sync/batch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(batchSync)
});

const result = await response.json();
console.log(`总操作数: ${result.total_operations}`);
console.log(`成功: ${result.successful_operations}`);
console.log(`失败: ${result.failed_operations}`);
console.log(`冲突: ${result.conflicts}`);
```

### 6. 增量拉取消息

```typescript
// 首次拉取所有消息
const initialPull = await fetch('/api/v1/sync/pull', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    last_sync_at: null,  // null 表示拉取全部
    include_activities: false,
    include_sessions: false,
    include_topics: false,
    include_messages: true,
    limit: 100
  })
});

const initialData = await initialPull.json();
console.log(`拉取到 ${initialData.messages.length} 条消息`);

// 保存同步时间戳
localStorage.setItem('lastSyncAt', initialData.sync_timestamp);

// 后续增量拉取
const incrementalPull = await fetch('/api/v1/sync/pull', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    last_sync_at: localStorage.getItem('lastSyncAt'),
    include_messages: true,
    limit: 100
  })
});

const incrementalData = await incrementalPull.json();
console.log(`增量拉取到 ${incrementalData.messages.length} 条新消息`);

// 更新同步时间戳
localStorage.setItem('lastSyncAt', incrementalData.sync_timestamp);
```

## 完整的聊天应用示例

```typescript
class ChatSyncManager {
  private token: string;
  private baseUrl: string;
  private lastSyncAt: string | null = null;

  constructor(token: string, baseUrl: string = 'http://localhost:8000') {
    this.token = token;
    this.baseUrl = baseUrl;
    this.lastSyncAt = localStorage.getItem('lastSyncAt');
  }

  // 发送消息
  async sendMessage(sessionId: string, content: string, topicId?: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/sync/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            operation: 'create',
            session_id: sessionId,
            topic_id: topicId,
            role: 'user',
            parts: [
              {
                type: 'text',
                content: content
              }
            ]
          }
        ],
        conflict_strategy: 'server_wins'
      })
    });

    const result = await response.json();
    if (result.messages[0].success) {
      return result.messages[0];
    } else {
      throw new Error(result.messages[0].error);
    }
  }

  // 同步消息
  async syncMessages() {
    const response = await fetch(`${this.baseUrl}/api/v1/sync/pull`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        last_sync_at: this.lastSyncAt,
        include_activities: false,
        include_sessions: false,
        include_topics: false,
        include_messages: true,
        limit: 100
      })
    });

    const result = await response.json();
    
    // 更新同步时间戳
    this.lastSyncAt = result.sync_timestamp;
    localStorage.setItem('lastSyncAt', this.lastSyncAt);

    return result.messages;
  }

  // 编辑消息
  async editMessage(messageId: string, newContent: string, version: number) {
    const response = await fetch(`${this.baseUrl}/api/v1/sync/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            operation: 'update',
            id: messageId,
            version: version,
            parts: [
              {
                type: 'text',
                content: newContent
              }
            ]
          }
        ],
        conflict_strategy: 'fail'  // 编辑时使用 fail 策略
      })
    });

    const result = await response.json();
    const msgResult = result.messages[0];

    if (msgResult.conflict) {
      // 有冲突，需要重新拉取
      throw new Error('消息已被其他客户端修改，请刷新后重试');
    }

    if (!msgResult.success) {
      throw new Error(msgResult.error);
    }

    return msgResult;
  }

  // 删除消息
  async deleteMessage(messageId: string, version: number) {
    const response = await fetch(`${this.baseUrl}/api/v1/sync/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            operation: 'delete',
            id: messageId,
            version: version
          }
        ],
        conflict_strategy: 'server_wins'
      })
    });

    const result = await response.json();
    return result.messages[0];
  }

  // 定期同步（轮询）
  startAutoSync(intervalMs: number = 5000) {
    return setInterval(async () => {
      try {
        const newMessages = await this.syncMessages();
        if (newMessages.length > 0) {
          console.log(`同步到 ${newMessages.length} 条新消息`);
          // 触发 UI 更新
          this.onNewMessages(newMessages);
        }
      } catch (error) {
        console.error('同步失败:', error);
      }
    }, intervalMs);
  }

  // 新消息回调（需要实现）
  onNewMessages(messages: any[]) {
    // 在这里更新 UI
    console.log('收到新消息:', messages);
  }
}

// 使用示例
const chatManager = new ChatSyncManager(token);

// 发送消息
await chatManager.sendMessage(sessionId, '你好！');

// 手动同步
const newMessages = await chatManager.syncMessages();

// 启动自动同步（每5秒）
const syncInterval = chatManager.startAutoSync(5000);

// 停止自动同步
clearInterval(syncInterval);
```

## 注意事项

1. **MessagePart 替换**：更新 Message 时如果提供 `parts` 数组，会完全替换所有现有的 parts
2. **版本控制**：始终提供正确的 `version` 字段以避免冲突
3. **用户隔离**：Message 通过 session_id 自动关联到 user_id，无需手动指定
4. **性能优化**：
   - 大文件（如图片）建议使用 URL 而非 base64
   - 使用合理的 limit 参数（建议 100-500）
   - 考虑使用 WebSocket 替代轮询（未来版本）
5. **错误处理**：始终检查 `success` 和 `conflict` 字段

## 测试

运行测试脚本：

```bash
python test_message_sync.py
```

确保：
1. 后端服务正在运行
2. 已创建测试用户
3. 数据库迁移已执行
