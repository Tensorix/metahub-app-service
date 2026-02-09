# Step 4: IM Gateway Integration

## Change Point

**File**: `app/router/v1/im_gateway.py`

修改 `_handle_incoming_message()` 函数，在消息入库并 commit 后触发自动回复。

## Current Code

```python
async def _handle_incoming_message(data: dict, user_id: UUID, source: str) -> None:
    db = SessionLocal()
    try:
        if "source" not in data:
            data["source"] = source
        webhook_data = IMMessageWebhookRequest(**data)
        result = WebhookService.process_im_message(
            db=db,
            webhook_data=webhook_data,
            user_id=user_id,
        )
        db.commit()
        logger.info(f"WS incoming message processed: {result}")
    except Exception as e:
        logger.error(f"Error processing WS message: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()
```

## Modified Code

```python
async def _handle_incoming_message(data: dict, user_id: UUID, source: str) -> None:
    db = SessionLocal()
    try:
        if "source" not in data:
            data["source"] = source
        webhook_data = IMMessageWebhookRequest(**data)
        result = WebhookService.process_im_message(
            db=db,
            webhook_data=webhook_data,
            user_id=user_id,
        )
        db.commit()
        logger.info(f"WS incoming message processed: {result}")

        # 触发自动回复（fire-and-forget，不阻塞消息处理）
        session_id = result.get("session_id")
        if session_id:
            asyncio.create_task(
                _try_auto_reply(
                    session_id=UUID(session_id),
                    user_id=user_id,
                    message_str=webhook_data.message_str,
                )
            )
    except Exception as e:
        logger.error(f"Error processing WS message: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


async def _try_auto_reply(session_id: UUID, user_id: UUID, message_str: str) -> None:
    """
    尝试自动回复，仅在 session 开启了自动回复时执行。
    独立函数便于错误隔离。
    """
    try:
        from app.service.auto_reply import AutoReplyService
        await AutoReplyService.process(
            session_id=session_id,
            user_id=user_id,
            incoming_message_str=message_str,
        )
    except Exception as e:
        logger.error(f"Auto-reply error for session {session_id}: {e}", exc_info=True)
```

## Key Points

### Fire-and-Forget Pattern
- 使用 `asyncio.create_task()` 将自动回复放入事件循环
- 不 `await`，消息处理函数立即返回
- WebSocket 主循环不被自动回复阻塞

### Timing Guarantee
- `db.commit()` 在 `create_task()` 之前执行
- 自动回复启动时，incoming message 已确保入库
- 满足「消息先入库再自动回复」的要求

### Error Isolation
- `_try_auto_reply()` 内部完整 try/except
- `AutoReplyService.process()` 使用独立 DB session
- 任何自动回复失败不影响已入库的消息

### No Additional Query
- `_handle_incoming_message()` 本身不查询 Session 的 auto_reply 状态
- 由 `AutoReplyService.process()` 在独立事务中检查
- 保持消息处理路径最小化改动
