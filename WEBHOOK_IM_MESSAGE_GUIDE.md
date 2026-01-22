# IM 消息 Webhook 使用指南

## 概述

本功能实现了通过 webhook 接收 IM 消息，并使用 LangChain Agent 智能分析消息重要性，自动创建 Activity 的完整流程。

## 架构设计

```
外部 IM 系统
    ↓ (Webhook)
接收消息 (POST /api/v1/webhooks/im/message)
    ↓ (返回 202 Accepted)
后台异步处理
    ├─ 创建/更新 Session (基于 external_id)
    ├─ 创建/更新 MessageSender
    ├─ 创建 Message 和 MessagePart
    ├─ 获取会话上下文 (最近 30 条消息)
    ├─ 创建 Event (type="im_message")
    ├─ LangChain Agent 分析
    │   ├─ 判断消息是否重要
    │   ├─ 提取关键信息
    │   └─ 生成 Activity 建议
    └─ 如果重要 → 创建 Activity
```

## 核心特性

### 1. 双认证支持
- **JWT Token**: 标准的用户认证方式
- **API Key**: 以 `sk-` 开头的 API Key，适合外部系统集成

### 2. 智能消息分析
使用 LangChain + OpenAI 分析消息，判断标准：
- ✅ 包含任务分配（"请你..."、"需要..."）
- ✅ 提到会议、约会等时间安排
- ✅ 包含截止日期或紧急时间要求
- ✅ 提到重要的项目、决策或问题
- ✅ 包含紧急关键词（"紧急"、"重要"、"ASAP"）
- ✅ 需要回复或跟进的重要信息
- ❌ 日常闲聊、问候
- ❌ 简单的确认回复

### 3. 自动 Activity 创建
Agent 会自动填充：
- `name`: Activity 名称
- `type`: 类型（task/meeting/reminder/notification/follow_up）
- `priority`: 优先级 1-5
- `tags`: 标签列表
- `comments`: 备注说明
- `due_date_hint`: 截止时间提示

### 4. 上下文感知
分析时会考虑最近 30 条消息的上下文，提高判断准确性。

## 数据库变更

### 新增字段

**Session 表**:
```sql
ALTER TABLE session ADD COLUMN external_id VARCHAR(255);
CREATE INDEX ix_session_external_id ON session(external_id);
```

**Message 表**:
```sql
ALTER TABLE message ADD COLUMN external_id VARCHAR(255);
CREATE INDEX ix_message_external_id ON message(external_id);
```

## API 接口

### POST /api/v1/webhooks/im/message

接收 IM 消息的 webhook 回调。

**认证方式**:
```bash
# JWT Token
Authorization: Bearer <jwt_token>

# API Key
Authorization: Bearer sk-xxxxxxxxxxxxx
```

**请求体**:
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
  "message_str": "请你明天下午3点前完成项目报告",
  "message": [
    {
      "type": "text",
      "text": "请你明天下午3点前完成项目报告"
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
  "message": "消息已接收，正在后台处理",
  "session_id": null,
  "message_id": null,
  "event_id": null,
  "activity_created": false,
  "activity_id": null
}
```

## 配置

### 环境变量

在 `.env` 文件中添加：

```bash
# OpenAI API 配置
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### 数据库迁移

```bash
# 运行迁移
alembic upgrade head
```

### 安装依赖

```bash
# 使用 uv
uv sync

# 或使用 pip
pip install langchain langchain-openai langchain-core
```

## 使用示例

### 1. 获取 API Key

```bash
# 登录后获取 API Key
curl -X POST http://localhost:8000/api/v1/api-key/create \
  -H "Authorization: Bearer <jwt_token>"
```

### 2. 发送 Webhook

```python
import requests

webhook_data = {
    "timestamp": 1768179920,
    "session_id": "test_session_001",
    "message_id": "msg_001",
    "type": "FriendMessage",
    "sender": {
        "user_id": "user123",
        "nickname": "张三"
    },
    "self_id": "testbot",
    "message_str": "请你明天下午3点前完成项目报告，这个很紧急！",
    "message": [
        {
            "type": "Plain",
            "text": "请你明天下午3点前完成项目报告，这个很紧急！",
            "convert": True
        }
    ],
    "group": None,
    "raw_message": {}
}

response = requests.post(
    "http://localhost:8000/api/v1/webhooks/im/message",
    headers={
        "Authorization": "Bearer sk-your-api-key",
        "Content-Type": "application/json"
    },
    json=webhook_data
)

print(response.json())
```

### 3. 查看结果

```bash
# 查看 Sessions
curl http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer <token>"

# 查看 Events
curl http://localhost:8000/api/v1/experimental/events \
  -H "Authorization: Bearer <token>"

# 查看 Activities
curl http://localhost:8000/api/v1/activities \
  -H "Authorization: Bearer <token>"
```

## 测试

运行测试脚本：

```bash
# 修改 test_webhook_im_message.py 中的 API_KEY
python test_webhook_im_message.py
```

## 文件结构

```
app/
├── agent/
│   ├── __init__.py
│   └── message_analyzer.py          # LangChain Agent 实现
├── db/
│   └── model/
│       ├── session.py                # 添加 external_id 字段
│       └── message.py                # 添加 external_id 字段
├── router/
│   └── v1/
│       └── webhook.py                # Webhook 路由
├── schema/
│   └── webhook.py                    # Webhook Schema
├── service/
│   └── webhook.py                    # Webhook 业务逻辑
├── deps.py                           # 添加 get_current_user_flexible
└── config.py                         # 添加 OpenAI 配置

alembic/
└── versions/
    └── eb73a2a73640_add_external_id_to_session_and_message.py
```

## 监控和调试

### 查看日志

```bash
# 后台处理日志会显示：
# - Session 创建/更新
# - Message 创建
# - Event 创建
# - Agent 分析结果
# - Activity 创建（如果重要）
```

### 常见问题

**Q: Agent 分析失败怎么办？**
A: 检查 OPENAI_API_KEY 和 OPENAI_BASE_URL 配置，查看日志中的错误信息。

**Q: 消息没有创建 Activity？**
A: Agent 判断消息不重要。可以查看日志中的 `reasoning` 字段了解原因。

**Q: 如何调整判断标准？**
A: 修改 `app/agent/message_analyzer.py` 中的 system prompt。

**Q: 支持哪些消息类型？**
A: 目前支持 FriendMessage（私聊）和 GroupMessage（群聊）。

## 性能优化

1. **异步处理**: 使用 FastAPI BackgroundTasks，立即返回 202
2. **上下文限制**: 只获取最近 30 条消息
3. **LLM 缓存**: 可以考虑添加 Redis 缓存相似消息的分析结果
4. **批量处理**: 可以实现消息队列批量处理

## 扩展建议

1. **自定义 Prompt**: 根据业务需求调整 Agent 的判断标准
2. **多模型支持**: 支持不同的 LLM 提供商（Claude、本地模型等）
3. **用户偏好**: 记录用户对 Activity 的反馈，优化判断
4. **消息队列**: 使用 Celery 或 RQ 处理大量消息
5. **Webhook 验证**: 添加签名验证确保请求来源可信

## 安全建议

1. **API Key 管理**: 定期轮换 API Key
2. **速率限制**: 添加 rate limiting 防止滥用
3. **数据验证**: 严格验证 webhook 数据格式
4. **日志脱敏**: 避免记录敏感信息
5. **HTTPS**: 生产环境必须使用 HTTPS

## 总结

这个实现提供了一个优雅、可扩展的 IM 消息处理方案：
- ✅ 双认证支持（JWT + API Key）
- ✅ 异步处理（202 Accepted）
- ✅ 智能分析（LangChain Agent）
- ✅ 上下文感知（最近 30 条消息）
- ✅ 自动创建 Activity
- ✅ 用户隔离（所有数据都关联 user_id）
- ✅ 可扩展架构（易于添加新功能）
