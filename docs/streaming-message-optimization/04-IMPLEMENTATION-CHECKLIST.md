# 实施检查清单

## 概述

本文档提供流式消息优化方案的分阶段实施清单，按依赖关系和风险级别排序。

---

## 阶段 0：数据库迁移（前置）

### 0.1 Message 表新增字段

- [ ] **创建迁移文件** `alembic revision -m "add_message_str"`
  - [ ] 添加 `message_str` 字段 (Text, nullable=True)
  - [ ] 添加字段注释

- [ ] **执行迁移** `alembic upgrade head`

- [ ] **验证迁移**
  - [ ] 确认字段已添加
  - [ ] 确认现有数据不受影响

### 0.2 工具函数

- [ ] **新增** `app/utils/message_utils.py`
  - [ ] 实现 `parts_to_message_str()` 函数
  - [ ] 实现 `get_text_only()` 函数
  - [ ] 添加单元测试

### 0.3 现有数据迁移（可选，上线后执行）

- [ ] **新增** `scripts/migrate_message_str.py`
  - [ ] 批量更新现有消息的 message_str
  - [ ] 支持断点续传

---

## 阶段 1：常量与类型定义（低风险）

### 1.1 后端常量

- [ ] **更新** `app/constants/message.py`
  - [ ] 添加 `MessagePartType.TOOL_CALL`
  - [ ] 添加 `MessagePartType.TOOL_RESULT`
  - [ ] 添加 `MessagePartType.ERROR`
  - [ ] 添加 `MessagePartType.THINKING`
  - [ ] 添加 `AI_TYPES` 集合
  - [ ] 添加 `is_ai_type()` 方法

### 1.2 后端 Schema

- [ ] **更新** `app/schema/session.py`
  - [ ] 更新 `MessagePartCreate.type` 字段描述
  - [ ] 更新 `MessagePartResponse.type` 字段描述

- [ ] **更新** `app/schema/agent_chat.py`
  - [ ] 添加 `ToolCallEventData` 模型
  - [ ] 添加 `ToolResultEventData` 模型
  - [ ] 添加 `ErrorEventData` 模型
  - [ ] 更新 `StreamEvent` 文档

### 1.3 前端类型

- [ ] **更新** `frontend/src/lib/api.ts`
  - [ ] 扩展 `MessagePartType` 类型（添加 thinking）
  - [ ] 添加 `ToolCallContent` 接口
  - [ ] 添加 `ToolResultContent` 接口
  - [ ] 添加 `ErrorContent` 接口
  - [ ] 添加 `ThinkingContent` 接口
  - [ ] 添加类型守卫函数
  - [ ] 添加内容解析函数

- [ ] **更新** `frontend/src/lib/agentApi.ts`
  - [ ] 更新 `ChatEvent` 接口添加 `call_id` 和 `thinking` 事件

### 1.4 验证

- [ ] 运行类型检查 `npm run typecheck`
- [ ] 确保无类型错误

---

## 阶段 2：后端核心逻辑（中风险）

### 2.1 数据结构

- [ ] **新增** `app/router/v1/agent_chat.py` 中的数据类
  - [ ] 添加 `StreamingPart` dataclass
  - [ ] 添加 `StreamingCollector` dataclass
  - [ ] 实现 `generate_call_id()` 方法
  - [ ] 实现 `add_tool_call()` 方法
  - [ ] 实现 `add_tool_result()` 方法
  - [ ] 实现 `add_error()` 方法
  - [ ] 实现 `to_parts_data()` 方法

### 2.2 消息保存函数

- [ ] **新增** `_save_message_with_parts()` 函数
  - [ ] 支持多 Part 创建
  - [ ] 保持事务一致性

- [ ] **保留** 原有 `_save_message()` 函数
  - [ ] 内部调用 `_save_message_with_parts()`
  - [ ] 保持向后兼容

### 2.3 SSE 流式处理

- [ ] **修改** `generate_events()` 生成器
  - [ ] 使用 `StreamingCollector` 收集事件
  - [ ] 处理 `tool_call` 事件并生成 `call_id`
  - [ ] 处理 `tool_result` 事件并关联 `call_id`
  - [ ] 处理 `error` 事件
  - [ ] 流式完成后批量保存 Parts
  - [ ] 取消时保存部分内容

### 2.4 WebSocket 处理

- [ ] **修改** `stream_to_ws()` 函数
  - [ ] 同步使用 `StreamingCollector`
  - [ ] 发送 `call_id` 到客户端
  - [ ] 批量保存 Parts

### 2.5 验证

- [ ] 单元测试 `StreamingCollector`
- [ ] 集成测试 SSE 端点
- [ ] 集成测试 WebSocket 端点
- [ ] 验证数据库 Parts 正确保存

---

## 阶段 3：前端 Store 改动（中风险）

### 3.1 状态扩展

- [ ] **更新** `frontend/src/store/chat.ts`
  - [ ] 添加 `pendingParts` 状态字段
  - [ ] 添加 `streamingThinking` 状态字段
  - [ ] 添加 `isThinking` 状态字段
  - [ ] 更新 `activeToolCall` 类型（添加 `call_id`）
  - [ ] 更新初始状态

### 3.2 `sendAIMessage` 重构

- [ ] **重构** 消息事件处理
  - [ ] `message` 事件：更新 text part
  - [ ] `tool_call` 事件：添加 tool_call part，设置 activeToolCall
  - [ ] `tool_result` 事件：添加 tool_result part，清除 activeToolCall
  - [ ] `error` 事件：添加 error part，设置 streamError
  - [ ] `done` 事件：清理状态，刷新消息

### 3.3 辅助方法

- [ ] **更新** `clearStreamState()`
  - [ ] 清理 `pendingParts`

### 3.4 验证

- [ ] Store 单元测试
- [ ] 验证状态正确更新
- [ ] 验证消息 parts 正确构建

---

## 阶段 4：前端组件（低风险）

### 4.1 新增组件

- [ ] **新增** `frontend/src/components/chat/ToolCallPart.tsx`
  - [ ] 折叠/展开交互
  - [ ] 显示工具名称和状态
  - [ ] 展开时显示参数和结果

- [ ] **新增** `frontend/src/components/chat/ThinkingPart.tsx`
  - [ ] 折叠/展开交互
  - [ ] 显示思考图标和状态
  - [ ] 流式时显示打字光标
  - [ ] 展开时显示完整思考内容

- [ ] **新增** `frontend/src/components/chat/ErrorPart.tsx`
  - [ ] 错误图标和样式
  - [ ] 显示错误消息和错误码

### 4.2 修改组件

- [ ] **修改** `frontend/src/components/chat/AIMessageList.tsx`
  - [ ] 导入新组件（ThinkingPart, ToolCallPart, ErrorPart）
  - [ ] 解析和组织 parts（添加 thinkingParts）
  - [ ] 配对 tool_call 和 tool_result
  - [ ] 渲染 ThinkingPart 组件
  - [ ] 渲染 ToolCallPart 组件
  - [ ] 渲染 ErrorPart 组件

- [ ] **修改** `frontend/src/components/chat/ToolCallIndicator.tsx`
  - [ ] 支持 `call_id` 属性（可选）

### 4.3 Hook 更新

- [ ] **更新** `frontend/src/hooks/useAIChat.ts`
  - [ ] 导出 `pendingParts`
  - [ ] 导出 `streamingThinking`
  - [ ] 导出 `isThinking`

### 4.4 验证

- [ ] 组件渲染测试
- [ ] 交互测试（折叠/展开）
- [ ] 样式验证

---

## 阶段 5：集成测试（验证）

### 5.1 端到端测试

- [ ] 测试简单文本对话
  - [ ] 验证消息正确显示
  - [ ] 验证入库数据正确

- [ ] 测试包含工具调用的对话
  - [ ] 验证 tool_call 事件处理
  - [ ] 验证 tool_result 事件处理
  - [ ] 验证 UI 正确展示折叠的工具调用
  - [ ] 验证入库 Parts 完整

- [ ] 测试错误场景
  - [ ] 验证 error 事件处理
  - [ ] 验证错误 UI 显示
  - [ ] 验证错误入库

- [ ] 测试取消场景
  - [ ] 验证取消后部分内容保存
  - [ ] 验证 UI 显示 [已取消]

### 5.2 兼容性测试

- [ ] 验证老消息（只有 text part）正常显示
- [ ] 验证 API 向后兼容

### 5.3 性能测试

- [ ] 验证大量工具调用时的渲染性能
- [ ] 验证数据库写入性能

---

## 阶段 6：文档与清理

### 6.1 API 文档

- [ ] 更新 API 文档说明新的 Part 类型
- [ ] 更新事件数据结构文档

### 6.2 代码清理

- [ ] 删除废弃代码
- [ ] 添加必要注释

### 6.3 发布

- [ ] 创建 PR
- [ ] Code Review
- [ ] 合并到主分支

---

## 风险点与回滚计划

### 风险点

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 后端保存逻辑错误 | 数据丢失 | 保留原有 `_save_message` 函数，渐进迁移 |
| 前端解析错误 | UI 崩溃 | 添加 try-catch，优雅降级 |
| 性能问题 | 响应变慢 | 监控入库时间，必要时优化 |

### 回滚计划

1. **阶段 2 回滚**：
   - 恢复原有 `_save_message` 调用
   - 移除 `StreamingCollector`

2. **阶段 3-4 回滚**：
   - 恢复原有 store 逻辑
   - 移除新增组件
   - 前端只展示 text part

### 特性开关（可选）

```python
# app/config.py
ENABLE_MULTI_PART_MESSAGES = os.getenv("ENABLE_MULTI_PART_MESSAGES", "true") == "true"
```

```typescript
// frontend/src/config.ts
export const ENABLE_MULTI_PART_MESSAGES = import.meta.env.VITE_ENABLE_MULTI_PART_MESSAGES !== 'false';
```

---

## 时间估算

| 阶段 | 预估时间 |
|-----|---------|
| 阶段 0：数据库迁移 | 0.5 天 |
| 阶段 1：类型定义 | 0.5 天 |
| 阶段 2：后端核心 | 1-1.5 天 |
| 阶段 3：前端 Store | 1 天 |
| 阶段 4：前端组件 | 1 天 |
| 阶段 5：集成测试 | 0.5-1 天 |
| 阶段 6：文档清理 | 0.5 天 |
| **总计** | **5-6 天** |

---

## 验收标准

### 功能验收

- [ ] AI 对话中的工具调用正确记录到数据库
- [ ] AI 对话中的思考过程正确记录到数据库
- [ ] message_str 字段正确生成纯文本内容
- [ ] 刷新页面后能看到完整的对话历史（包括思考、工具调用）
- [ ] 思考过程在 UI 中以折叠形式展示
- [ ] 工具调用在 UI 中以折叠形式展示
- [ ] 错误信息正确记录和展示
- [ ] 取消操作正确保存部分内容

### 非功能验收

- [ ] 无类型错误
- [ ] 无 lint 警告
- [ ] 测试覆盖率达标
- [ ] 性能无明显下降
