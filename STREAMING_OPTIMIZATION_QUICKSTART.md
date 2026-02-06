# 流式消息优化 - 快速启动指南

## ✅ 实现完成

所有功能已实现并通过编译测试！

## 🚀 快速启动

### 1. 数据库迁移

```bash
# 运行迁移
alembic upgrade head

# 可选：为现有消息生成 message_str
python -m scripts.migrate_message_str
```

### 2. 启动后端

```bash
python main.py
```

后端将在 `http://localhost:8000` 启动

### 3. 启动前端

```bash
cd frontend
npm run dev
```

前端将在 `http://localhost:5173` 启动

## 🧪 测试功能

### 基础测试

1. **打开浏览器** 访问 `http://localhost:5173`
2. **登录** 使用你的账号
3. **创建或选择 AI Session**
4. **发送消息** 测试基本对话

### 高级功能测试

#### 1. 工具调用（如果 agent 支持）

发送需要工具的消息，例如：
- "帮我搜索一下天气"
- "查询当前时间"

观察：
- ✅ 工具调用指示器显示
- ✅ 工具调用卡片（可折叠）
- ✅ 工具结果显示
- ✅ 刷新页面后历史保留

#### 2. 思考过程（如果 agent 支持）

发送复杂问题，观察：
- ✅ 思考过程卡片（可折叠）
- ✅ 流式显示思考内容
- ✅ 点击展开查看完整思考

#### 3. 错误处理

触发错误场景（如断网），观察：
- ✅ 错误信息显示
- ✅ 错误码显示
- ✅ 部分内容保存

#### 4. 取消功能

1. 发送消息
2. 在流式过程中点击停止按钮
3. 观察：
   - ✅ 显示 [已取消] 标记
   - ✅ 部分内容已保存

## 📊 验证数据

### 检查数据库

```sql
-- 查看最新消息的 message_str
SELECT id, role, message_str 
FROM message 
ORDER BY created_at DESC 
LIMIT 5;

-- 查看消息的 parts
SELECT m.id, m.role, mp.type, 
       LEFT(mp.content, 50) as content_preview
FROM message m
JOIN message_part mp ON mp.message_id = m.id
WHERE m.created_at > NOW() - INTERVAL '1 hour'
ORDER BY m.created_at DESC, mp.created_at ASC;

-- 查看工具调用
SELECT m.id, mp.type, mp.content
FROM message m
JOIN message_part mp ON mp.message_id = m.id
WHERE mp.type IN ('tool_call', 'tool_result')
ORDER BY m.created_at DESC
LIMIT 10;
```

### 运行测试脚本

```bash
python test_streaming_optimization.py
```

## 🎯 功能清单

### 后端功能
- ✅ 收集所有流式事件（message, thinking, tool_call, tool_result, error）
- ✅ 生成 call_id 关联工具调用和结果
- ✅ 批量保存多个 MessagePart
- ✅ 自动生成 message_str 用于检索
- ✅ 支持取消时保存部分内容

### 前端功能
- ✅ 实时显示流式内容
- ✅ 思考过程卡片（可折叠）
- ✅ 工具调用卡片（可折叠，显示参数和结果）
- ✅ 错误信息显示
- ✅ 工具调用指示器（流式中）
- ✅ 刷新页面后恢复完整历史

## 🐛 故障排查

### 前端构建失败

```bash
cd frontend
npm install
npm run build
```

### 数据库迁移失败

```bash
# 查看当前版本
alembic current

# 查看所有版本
alembic history

# 如果有多个 head，先合并
alembic merge -m "merge_heads" <rev1> <rev2>
alembic upgrade head
```

### Agent 不支持工具调用

这是正常的，不是所有 agent 都支持工具调用。基础功能（文本消息）仍然可以正常工作。

### 看不到思考过程

思考过程需要 agent 明确输出 `thinking` 事件。如果你的 agent 不支持，这是正常的。

## 📝 UI 说明

### 消息结构

```
AI 消息
├── 思考过程卡片（紫色，可折叠）
├── 工具调用卡片 1（灰色，可折叠）
│   ├── 工具名称
│   ├── 参数（展开后显示）
│   └── 结果（展开后显示）
├── 工具调用卡片 2
├── 文本内容（主要回复）
└── 错误信息（红色，如有）
```

### 交互说明

- **点击卡片头部** - 展开/折叠详情
- **工具调用状态**：
  - 🔵 执行中 - 显示加载图标
  - ✅ 成功 - 显示绿色勾
  - ❌ 失败 - 显示红色叉

## 🎨 自定义

### 修改卡片样式

编辑以下文件：
- `frontend/src/components/chat/ThinkingPart.tsx` - 思考卡片
- `frontend/src/components/chat/ToolCallPart.tsx` - 工具调用卡片
- `frontend/src/components/chat/ErrorPart.tsx` - 错误卡片

### 修改 message_str 生成规则

编辑 `app/utils/message_utils.py` 中的 `parts_to_message_str()` 函数

## 📚 相关文档

- `STREAMING_OPTIMIZATION_COMPLETE.md` - 完整实现文档
- `docs/streaming-message-optimization/` - 设计文档

## ✨ 下一步

1. **测试所有场景** - 确保功能正常
2. **收集反馈** - 观察用户体验
3. **性能优化** - 如有需要
4. **功能扩展** - 根据需求添加新功能

---

**状态**: ✅ 已完成并通过编译测试
**版本**: 1.0.0
**日期**: 2026-02-06
