# IM 消息 Webhook 快速开始

## 1. 安装依赖

```bash
# 使用 uv（推荐）
uv sync

# 或使用 pip
pip install -r requirements.txt
```

## 2. 配置环境变量

在 `.env` 文件中添加：

```bash
# OpenAI API 配置（必需）
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

## 3. 运行数据库迁移

```bash
alembic upgrade head
```

## 4. 启动服务

```bash
# 开发模式
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 或使用 make
make run
```

## 5. 获取 API Key

### 方式 1: 通过 API

```bash
# 先登录获取 JWT Token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'

# 使用 JWT Token 创建 API Key
curl -X POST http://localhost:8000/api/v1/api-key/create \
  -H "Authorization: Bearer <jwt_token>"
```

### 方式 2: 通过前端

访问前端界面，在用户设置中生成 API Key。

## 6. 测试 Webhook

### 使用测试脚本

```bash
# 修改 test_webhook_im_message.py 中的 API_KEY
python test_webhook_im_message.py
```

### 使用 curl

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/im/message \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
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
        "convert": true
      }
    ],
    "group": null,
    "raw_message": {}
  }'
```

## 7. 查看结果

### 查看 Sessions

```bash
curl http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer sk-your-api-key"
```

### 查看 Activities

```bash
curl http://localhost:8000/api/v1/activities \
  -H "Authorization: Bearer sk-your-api-key"
```

### 查看 Events

```bash
curl http://localhost:8000/api/v1/experimental/events \
  -H "Authorization: Bearer sk-your-api-key"
```

## 8. 查看日志

服务运行时会输出详细日志：

```
INFO: Received IM message webhook: session_id=test_session_001, message_id=msg_001
INFO: Session: id=xxx, external_id=test_session_001
INFO: Sender: id=xxx, name=张三
INFO: Message created: id=xxx, external_id=msg_001
INFO: Context messages count: 1
INFO: Event created: id=xxx, type=im_message
INFO: Message analysis result: is_important=True, reasoning=消息包含明确的任务分配和紧急时间要求
INFO: Activity created: id=xxx, name=完成项目报告
INFO: Background task completed: {...}
```

## 9. API 文档

访问 Swagger UI 查看完整 API 文档：

```
http://localhost:8000/docs
```

## 常见问题

### Q: 提示 "无效的 API Key"

A: 确保 API Key 以 `sk-` 开头，并且是有效的。

### Q: Agent 分析失败

A: 检查 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL` 配置是否正确。

### Q: 消息没有创建 Activity

A: Agent 判断消息不重要。可以查看日志中的 `reasoning` 字段。

### Q: 如何自定义判断标准？

A: 修改 `app/agent/message_analyzer.py` 中的 system prompt。

## 下一步

- 阅读完整文档: [WEBHOOK_IM_MESSAGE_GUIDE.md](./WEBHOOK_IM_MESSAGE_GUIDE.md)
- 集成到你的 IM 系统
- 根据需求调整 Agent 的判断标准
- 添加更多自定义功能

## 技术支持

如有问题，请查看：
1. 服务日志
2. API 文档 (http://localhost:8000/docs)
3. 完整指南 (WEBHOOK_IM_MESSAGE_GUIDE.md)
