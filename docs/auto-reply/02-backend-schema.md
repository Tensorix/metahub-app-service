# Step 2: Backend Schema & Service Update

## Schema Changes

**File**: `app/schema/session.py`

### SessionBase - 新增字段

```python
class SessionBase(BaseModel):
    # ... existing fields ...
    auto_reply_enabled: bool = Field(False, description="是否启用自动回复（仅 pm/group 会话有效）")
```

### SessionUpdate - 新增可选字段

```python
class SessionUpdate(BaseModel):
    # ... existing fields ...
    auto_reply_enabled: Optional[bool] = Field(None, description="是否启用自动回复")
```

### SessionResponse - 自动继承

`SessionResponse` 继承自 `SessionBase`，使用 `from_attributes=True`，新字段自动映射。

## Service Changes

**File**: `app/service/session.py`

`SessionService.update_session()` 已经是通用的 `model_dump(exclude_unset=True)` + `setattr` 模式，新增字段自动支持，**无需修改**。

## Validation Logic

`auto_reply_enabled=True` 时应确保 `agent_id` 已设置。此校验放在前端 UI 层（禁用开关直到选择 Agent）和后端 Service 层（更新时校验）：

**File**: `app/service/session.py` - `update_session()` 方法末尾添加

```python
# 校验：开启自动回复时必须关联 Agent
if session.auto_reply_enabled and not session.agent_id:
    raise ValueError("启用自动回复时必须关联一个 Agent")
```

## API Behavior

- `PUT /api/v1/sessions/{session_id}` 传 `{"auto_reply_enabled": true, "agent_id": "<uuid>"}` 即可开启
- `PUT /api/v1/sessions/{session_id}` 传 `{"auto_reply_enabled": false}` 关闭
- `GET /api/v1/sessions/{session_id}` 返回中包含 `auto_reply_enabled` 字段
