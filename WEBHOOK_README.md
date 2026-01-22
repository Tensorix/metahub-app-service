# IM 消息 Webhook 功能

## 🎯 功能概述

通过 webhook 接收 IM 消息，使用 LangChain Agent 智能分析消息重要性，自动创建 Activity。

## ✨ 核心特性

- ✅ **双认证支持**: JWT Token 和 API Key (sk-开头)
- ✅ **异步处理**: 返回 202 Accepted，后台处理
- ✅ **智能分析**: LangChain + OpenAI 判断消息重要性
- ✅ **上下文感知**: 分析时考虑最近 30 条消息
- ✅ **自动创建 Activity**: 根据 Agent 建议自动创建待办事项
- ✅ **用户隔离**: 所有数据都关联 user_id
- ✅ **外部 ID 映射**: Session 和 Message 支持 external_id

## 🚀 快速开始

### 1. 安装依赖

```bash
uv sync
```

### 2. 配置环境变量

在 `.env` 文件中添加：

```bash
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### 3. 运行数据库迁移

```bash
alembic upgrade head
```

### 4. 启动服务

```bash
uvicorn main:app --reload
```

### 5. 测试

```bash
# 修改测试脚本中的 API Key
python test_webhook_im_message.py
```

## 📖 文档

- **[快速开始](./WEBHOOK_QUICKSTART.md)** - 5 分钟上手指南
- **[完整指南](./WEBHOOK_IM_MESSAGE_GUIDE.md)** - 详细使用文档
- **[架构设计](./WEBHOOK_ARCHITECTURE.md)** - 系统架构说明
- **[实现总结](./WEBHOOK_IMPLEMENTATION_SUMMARY.md)** - 代码变更清单
- **[集成示例](./examples/webhook_integration_example.py)** - Python 集成代码

## 🔌 API 接口

### POST /api/v1/webhooks/im/message

接收 IM 消息的 webhook 回调。

**认证**:
```bash
Authorization: Bearer sk-your-api-key
```

**请求示例**:
```json
{
  "timestamp": 1768179920,
  "session_id": "external_session_id",
  "message_id": "external_message_id",
  "session_type": "pm",
  "source": "astr_qq",
  "sender": {
    "user_id": "user123",
    "nickname": "张三"
  },
  "self_id": "bot_id",
  "message_str": "请你明天下午3点前完成项目报告，这个很紧急！",
  "message": [
    {
      "type": "text",
      "text": "请你明天下午3点前完成项目报告，这个很紧急！"
    }
  ],
  "group": null,
  "raw_message": {}
}
```

**响应** (202 Accepted):
```json
{
  "status": "accepted",
  "message": "消息已接收，正在后台处理"
}
```

## 🧠 智能分析

Agent 会自动判断消息是否重要，判断标准：

### 重要消息 ✅
- 包含任务分配 ("请你..."、"需要...")
- 提到会议、约会等时间安排
- 包含截止日期或紧急时间要求
- 提到重要的项目、决策或问题
- 包含紧急关键词 ("紧急"、"重要"、"ASAP")

### 不重要消息 ❌
- 日常闲聊、问候
- 简单的确认回复 ("好的"、"收到")
- 无关紧要的信息分享

## 📊 数据流程

```
外部 IM 系统
    ↓ (Webhook)
接收消息 (返回 202)
    ↓ (后台处理)
创建 Session/Message
    ↓
获取上下文 (30 条消息)
    ↓
创建 Event
    ↓
LangChain Agent 分析
    ↓
如果重要 → 创建 Activity
```

## 🛠️ 技术栈

- **Web 框架**: FastAPI
- **ORM**: SQLAlchemy
- **数据库**: PostgreSQL
- **AI 框架**: LangChain
- **LLM**: OpenAI GPT-4o-mini
- **认证**: JWT + API Key

## 📁 文件结构

```
app/
├── agent/
│   └── message_analyzer.py      # LangChain Agent
├── router/v1/
│   └── webhook.py                # Webhook 路由
├── service/
│   └── webhook.py                # 业务逻辑
├── schema/
│   └── webhook.py                # 数据模型
└── db/model/
    ├── session.py                # Session 模型 (+ external_id)
    └── message.py                # Message 模型 (+ external_id)

alembic/versions/
└── eb73a2a73640_*.py             # 数据库迁移

docs/
├── WEBHOOK_QUICKSTART.md         # 快速开始
├── WEBHOOK_IM_MESSAGE_GUIDE.md   # 完整指南
├── WEBHOOK_ARCHITECTURE.md       # 架构设计
└── WEBHOOK_IMPLEMENTATION_SUMMARY.md  # 实现总结

examples/
└── webhook_integration_example.py  # 集成示例

tests/
└── test_webhook_im_message.py    # 测试脚本
```

## 🔐 安全特性

- ✅ 双认证支持 (JWT + API Key)
- ✅ 用户数据隔离
- ✅ 输入验证 (Pydantic)
- ✅ 错误处理
- ✅ 日志记录

## 🎨 使用示例

### Python 客户端

```python
from examples.webhook_integration_example import MetaHubWebhookClient

# 初始化客户端
client = MetaHubWebhookClient(
    base_url="http://localhost:8000",
    api_key="sk-your-api-key"
)

# 发送消息
response = client.send_message(
    session_id="user_123",
    message_id="msg_001",
    sender_user_id="user_123",
    sender_nickname="张三",
    message_text="请你明天下午3点前完成项目报告"
)

print(response)
```

### cURL

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/im/message \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": 1768179920,
    "session_id": "test_session",
    "message_id": "msg_001",
    "session_type": "pm",
    "source": "astr_qq",
    "sender": {"user_id": "user123", "nickname": "张三"},
    "self_id": "bot",
    "message_str": "请你明天下午3点前完成项目报告",
    "message": [{"type": "text", "text": "请你明天下午3点前完成项目报告"}],
    "group": null,
    "raw_message": {}
  }'
```

## 🔍 查看结果

```bash
# 查看 Sessions
curl http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer sk-your-api-key"

# 查看 Activities
curl http://localhost:8000/api/v1/activities \
  -H "Authorization: Bearer sk-your-api-key"

# 查看 Events
curl http://localhost:8000/api/v1/experimental/events \
  -H "Authorization: Bearer sk-your-api-key"
```

## 📝 日志示例

```
INFO: Received IM message webhook: session_id=test_session_001
INFO: Session: id=xxx, external_id=test_session_001
INFO: Sender: id=xxx, name=张三
INFO: Message created: id=xxx, external_id=msg_001
INFO: Context messages count: 1
INFO: Event created: id=xxx, type=im_message
INFO: Message analysis result: is_important=True
INFO: Activity created: id=xxx, name=完成项目报告
INFO: Background task completed
```

## 🚧 扩展建议

1. **自定义 Prompt**: 调整 Agent 判断标准
2. **多模型支持**: 支持 Claude、本地模型
3. **用户偏好**: 记录用户反馈优化判断
4. **消息队列**: 使用 Celery 处理大量消息
5. **缓存优化**: Redis 缓存分析结果
6. **Webhook 验证**: 添加签名验证
7. **速率限制**: 防止滥用

## ❓ 常见问题

**Q: Agent 分析失败怎么办？**
A: 检查 OPENAI_API_KEY 配置，查看日志错误信息。

**Q: 消息没有创建 Activity？**
A: Agent 判断消息不重要，查看日志中的 reasoning 字段。

**Q: 如何调整判断标准？**
A: 修改 `app/agent/message_analyzer.py` 中的 system prompt。

**Q: 支持哪些会话类型？**
A: 支持任意自定义类型，常见的有 pm（私聊）、group（群聊）、ai（AI对话）等，由上游系统定义。

## 📚 更多资源

- **API 文档**: http://localhost:8000/docs
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**开始使用**: 查看 [WEBHOOK_QUICKSTART.md](./WEBHOOK_QUICKSTART.md)

**完整文档**: 查看 [WEBHOOK_IM_MESSAGE_GUIDE.md](./WEBHOOK_IM_MESSAGE_GUIDE.md)
