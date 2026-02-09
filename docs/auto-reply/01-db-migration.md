# Step 1: Database Migration

## Changes

在 `session` 表新增一列：

```sql
ALTER TABLE session ADD COLUMN auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

## Model Change

**File**: `app/db/model/session.py`

```python
# 在 last_visited_at 之后新增
auto_reply_enabled: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
    comment="是否启用自动回复（仅 pm/group 会话有效）"
)
```

## Alembic Migration

```bash
alembic revision --autogenerate -m "add auto_reply_enabled to session"
alembic upgrade head
```

## Notes

- `agent_id` 已存在于 Session 模型中，无需修改，对 IM 会话语义扩展为「自动回复 Agent」
- `auto_reply_enabled` 默认 `False`，不影响现有会话行为
- 不需要新索引：自动回复判断仅在消息入库时按主键查询 Session，不需要独立索引
