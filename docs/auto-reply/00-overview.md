# Auto-Reply Feature Design

## Overview

为 IM 会话（pm/group）添加自动回复功能：当外部 IM 消息通过 WebSocket 网关进入系统后，消息先入库，再由关联的 Agent 自动生成回复并发送回 IM 平台。

## Core Requirements

1. **Session Settings**: pm/group 类型的 Session 可关联一个 Agent，并有自动回复开关
2. **Message First**: 外部消息必须先入库，再触发自动回复
3. **Non-Blocking**: 自动回复不阻塞 WebSocket 消息接收主循环
4. **Error Isolation**: 自动回复失败不影响消息入库

## Architecture

```
IM Bridge (WS) ──message──→ im_gateway._handle_incoming_message()
                                │
                                ├─ 1. WebhookService.process_im_message() → DB commit ✅
                                │
                                └─ 2. Check auto_reply_enabled && agent_id
                                       │
                                       └─ asyncio.create_task(auto_reply_service.process())
                                              │
                                              ├─ 3. Load recent messages as context
                                              ├─ 4. Invoke Agent (non-streaming)
                                              ├─ 5. Store reply message (role=self)
                                              └─ 6. Send via im_connection_manager.send_to_bridge()
```

## Design Decisions

### 复用 `agent_id` 字段

Session 模型已有 `agent_id` 字段，当前仅 AI 类型会话使用。对于 IM 会话（pm/group），`agent_id` 语义自然扩展为「关联的自动回复 Agent」，无需新增外键。

### 新增 `auto_reply_enabled` 列

在 Session 模型新增 boolean 列而非使用 `metadata_` JSONB，理由：
- 需要高效查询「所有开启自动回复的会话」
- 提供数据库层面的类型安全和默认值
- 语义清晰，不依赖 JSONB 字段约定

### 非流式调用 Agent

自动回复场景无需前端实时展示生成过程，使用 `agent_service.chat()` 非流式接口即可，更简单可靠。

## Implementation Steps

| Step | File | Description |
|------|------|-------------|
| 01 | DB Migration | Session 表新增 `auto_reply_enabled` 列 |
| 02 | Backend Schema & Service | 更新 Pydantic Schema 和 Session Service |
| 03 | Auto-Reply Service | 新建 `AutoReplyService` 核心逻辑 |
| 04 | IM Gateway Integration | 在消息入库后触发自动回复 |
| 05 | Frontend UI | SessionDialog 添加自动回复设置 |

## Scope

- **In Scope**: pm/group 会话的自动回复开关、Agent 关联、消息入库后触发、回复发送
- **Out of Scope**: 自动回复模板/规则引擎、多 Agent 轮询、回复审核队列、计费/配额
