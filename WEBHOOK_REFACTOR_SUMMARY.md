# Webhook 重构总结

## 已完成的修改

### 1. 移除类型映射，让上游系统负责

**修改前**：系统内部对消息类型进行映射（如 FriendMessage -> pm, GroupMessage -> group）

**修改后**：
- 直接使用上游提供的 `session_type` 和 `source` 字段
- 在接口文档中明确说明支持的类型
- 不做任何内部映射或转换

**影响的文件**：
- `app/schema/webhook.py`: 更新字段名和文档说明
- `app/service/webhook.py`: 移除映射逻辑，直接使用上游字段
- `app/router/v1/webhook.py`: 更新接口文档

### 2. source 字段开放给外部接口填写

**修改前**：source 字段可能在内部处理

**修改后**：
- `source` 字段由上游系统直接提供
- 支持的来源示例：`astr_qq`, `astr_wechat`, `astr_telegram` 等
- 参考 Session 表的 comment：`来源: null/astr_wechat/astr_qq/manual_upload`

**影响的文件**：
- `app/schema/webhook.py`: 添加 `source` 字段说明
- `app/service/webhook.py`: 直接使用 `webhook_data.source`
- `app/db/model/session.py`: 已有 source 字段定义

### 3. Message Part 类型调整

**修改前**：
- 支持 `plain` 类型（已废弃）
- 有兼容性转换逻辑

**修改后**：
- 移除 `plain` 类型的兼容性处理
- 支持的类型：`text`, `image`, `at`, `url`, `json`
- 更新数据库模型注释顺序

**影响的文件**：
- `app/service/webhook.py`: 移除 plain -> text 的转换逻辑
- `app/db/model/message_part.py`: 更新 type 字段注释

### 4. 修复字段引用错误

**问题**：调用 `analyze_message` 时使用了已废弃的 `webhook_data.type` 字段

**修复**：改为使用 `webhook_data.session_type`

**影响的文件**：
- `app/service/webhook.py`: 修复 agent 调用参数

### 5. 更新测试和示例代码

**修改内容**：
- 更新测试数据格式，使用新的字段名
- 添加不同来源的测试示例（QQ, 微信, Telegram）
- 更新集成示例代码

**影响的文件**：
- `test_webhook_im_message.py`: 更新测试数据
- `examples/webhook_integration_example.py`: 更新客户端代码

## 支持的字段值

### session_type（会话类型）
由上游系统定义，常见值：
- `pm`: 私聊
- `group`: 群聊
- `ai`: AI 对话
- 或其他自定义类型

### source（Webhook 来源）
由上游系统定义，常见值：
- `astr_qq`: Astrbot QQ 插件
- `astr_wechat`: Astrbot 微信插件
- `astr_telegram`: Astrbot Telegram 插件
- 或其他自定义来源

### message part type（消息部分类型）
由上游系统定义，常见值：
- `text`: 文本消息
- `image`: 图片消息
- `at`: @某人
- `url`: 链接
- `json`: JSON 数据

## 设计原则

1. **不做映射**：所有类型和来源字段由上游系统定义，本系统不做任何映射或转换
2. **开放扩展**：支持上游系统自定义类型和来源
3. **明确文档**：在接口文档中清楚说明支持的字段和常见值
4. **向后兼容**：保持数据库结构不变，只修改业务逻辑

## 潜在的类似问题分析

### 1. ✅ 已解决：Session 类型映射
- **位置**：`app/service/webhook.py` 的 `_get_or_create_session` 方法
- **状态**：已修复，直接使用上游提供的类型

### 2. ✅ 已解决：Message Part 类型处理
- **位置**：`app/service/webhook.py` 的 `_create_message` 方法
- **状态**：已移除 plain 类型兼容逻辑，直接使用上游类型

### 3. ✅ 已解决：上下文消息格式化
- **位置**：`app/service/webhook.py` 的 `_get_context_messages` 方法
- **状态**：已更新，支持所有消息类型（text/image/at/url/json）

### 4. ✅ 已解决：Schema 定义中的类型描述
- **位置**：`app/schema/session.py` 和 `app/schema/sync.py`
- **状态**：已更新，移除 `plain` 类型，统一为 `text/image/at/url/json`

### 5. ✅ 已解决：测试文件中的类型使用
- **位置**：`tests/test_session_api.py` 和 `test_message_sync.py`
- **状态**：已更新，将 `text/plain` 和 `plain` 改为 `text`

### 6. ✅ 已解决：Agent 分析器注释
- **位置**：`app/agent/message_analyzer.py`
- **状态**：已更新注释，说明 message_type 仅作为上下文参考

### 7. ⚠️ 需要注意：Event 数据存储
- **位置**：`app/service/webhook.py` 的 `_create_event` 方法
- **状态**：将完整的 webhook_data 存储在 raw_data 中
- **建议**：保持现状，这样可以保留所有原始信息

### 8. ⚠️ 需要注意：前端展示
- **位置**：前端代码（如果有）
- **状态**：需要检查前端是否有硬编码的类型判断
- **建议**：前端应该支持动态类型，不要硬编码类型列表

### 9. ⚠️ 需要注意：数据库迁移文件
- **位置**：`alembic/versions/554b041e94f8_*.py`
- **状态**：迁移文件中的注释还包含 `plain` 类型
- **建议**：历史迁移文件不需要修改，只影响注释不影响功能

## 测试建议

### 1. 基础功能测试
```bash
python test_webhook_im_message.py
```

### 2. 不同来源测试
测试不同的 source 值：
- `astr_qq`
- `astr_wechat`
- `astr_telegram`
- 自定义来源

### 3. 不同类型测试
测试不同的 session_type 值：
- `pm`
- `group`
- `ai`
- 自定义类型

### 4. 消息部分类型测试
测试不同的 message part type：
- `text`
- `image`
- `at`
- `url`
- `json`
- 未知类型（应该能正常处理）

## 文档更新建议

### 需要更新的文档
1. ✅ `WEBHOOK_README.md` - 需要更新字段说明
2. ✅ `WEBHOOK_IM_MESSAGE_GUIDE.md` - 需要更新示例
3. ✅ `WEBHOOK_QUICKSTART.md` - 需要更新快速开始指南
4. ⚠️ `WEBHOOK_ARCHITECTURE.md` - 可能需要更新架构说明

### 文档重点
- 强调"不做映射"的设计原则
- 列出常见的类型和来源值
- 说明如何自定义类型和来源
- 提供不同场景的示例

## 总结

### 核心变更
1. 移除所有内部类型映射逻辑
2. 直接使用上游提供的字段值
3. 在文档中明确说明支持的类型
4. 更新测试和示例代码

### 设计优势
1. **简化逻辑**：不需要维护映射关系
2. **更灵活**：支持任意自定义类型
3. **更清晰**：职责明确，上游负责类型定义
4. **易扩展**：添加新类型不需要修改代码

### 注意事项
1. 上游系统需要确保类型值的一致性
2. 建议在上游系统中定义类型常量
3. 可以考虑添加类型验证（可选）
4. 前端需要支持动态类型展示
