# Step 5: Frontend UI

## Changes

### 1. Session Type Update

**File**: `frontend/src/lib/api.ts`

在 `Session` interface 中添加字段（如果尚未由 API 自动覆盖）：

```typescript
interface Session {
  // ... existing fields ...
  auto_reply_enabled: boolean;  // 新增
}
```

### 2. SessionDialog Update

**File**: `frontend/src/components/SessionDialog.tsx`

在「基本信息」tab 中，对 pm/group 类型会话添加自动回复配置区域。

#### State 新增

```typescript
const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
```

#### useEffect 初始化

```typescript
useEffect(() => {
  if (session) {
    // ... existing ...
    setAutoReplyEnabled(session.auto_reply_enabled ?? false);
  } else {
    // ... existing ...
    setAutoReplyEnabled(false);
  }
}, [session, open]);
```

#### handleSubmit 修改

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    const isIMSession = type === 'pm' || type === 'group';
    const data = {
      name: name || undefined,
      type,
      source: source || undefined,
      agent_id: agentId || undefined,
      auto_reply_enabled: isIMSession ? autoReplyEnabled : undefined,
      metadata: isIMSession ? {
        ...(session?.metadata || {}),
        auto_send_im: autoSendIM,
      } : session?.metadata,
    };

    await onSubmit(data);
    onOpenChange(false);
  } catch (error) {
    console.error('Failed to save session:', error);
  } finally {
    setLoading(false);
  }
};
```

#### UI - Auto-Reply Section

在现有的「自动发送到 IM 平台」配置下方添加：

```tsx
{/* 自动回复配置 */}
{(type === 'pm' || type === 'group') && (
  <div className="space-y-3 rounded-lg border p-3">
    <div className="flex items-center justify-between">
      <div>
        <Label htmlFor="autoReply" className="cursor-pointer font-medium">
          自动回复
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          收到消息时，由关联的 Agent 自动生成回复
        </p>
      </div>
      <Switch
        id="autoReply"
        checked={autoReplyEnabled}
        onCheckedChange={setAutoReplyEnabled}
        disabled={!agentId}  // 未选择 Agent 时禁用
      />
    </div>

    {autoReplyEnabled && !agentId && (
      <p className="text-xs text-destructive">
        请先选择一个 Agent 才能启用自动回复
      </p>
    )}
  </div>
)}
```

## UI Behavior

| State | Agent Selected | Switch | Description |
|-------|---------------|--------|-------------|
| Default | No | Disabled | 开关灰色不可点击 |
| Agent Selected | Yes | Enabled (off) | 开关可用，默认关闭 |
| Enabled | Yes | On | 自动回复生效 |
| Remove Agent | No | Auto-off | 清除 Agent 时自动关闭开关 |

### Agent 清除联动

```typescript
// 在 agent select onChange 中
const handleAgentChange = (value: string) => {
  setAgentId(value);
  if (!value) {
    setAutoReplyEnabled(false);  // 清除 Agent 时关闭自动回复
  }
};
```

## Visual Design

自动回复配置使用一个带 border 的 card 样式区块，与普通配置项视觉区分：

```
┌─────────────────────────────────────────┐
│  自动回复                        [Switch]│
│  收到消息时，由关联的 Agent 自动生成回复    │
└─────────────────────────────────────────┘
```

这里使用项目已有的 `Switch` 组件（@radix-ui），与「包含已删除消息」等设置的交互风格一致。
