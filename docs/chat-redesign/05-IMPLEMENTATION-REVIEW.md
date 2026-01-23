# Chat Redesign - 实现问题分析与修复方案

## 1. 总体评估

### 1.1 已完成部分

| 模块 | 完成度 | 说明 |
|------|--------|------|
| ChatLayout | 40% | 布局结构错误，TopicSidebar 不应独立成第三栏 |
| SessionSidebar | 50% | 基础列表显示正常，新建按钮不可用 |
| MessageArea | 40% | 基础结构完成，缺少内嵌话题选择器 |
| TopicSidebar | 30% | 位置错误，应内嵌在 MessageArea 中 |
| Store (chat.ts) | 80% | 状态结构和主要 Actions 完成 |
| useScrollBoundary | 60% | 基础检测完成，缺少进度反馈 |
| virtualTopic.ts | 90% | 实现完整 |

### 1.2 主要问题分类

- **P0 - 架构错误**：布局结构与设计不符
- **P1 - 功能缺失**：影响核心用户体验
- **P2 - 体验问题**：可用但体验差
- **P3 - 设计偏离**：与设计文档不一致

---

## 2. 详细问题分析

### 2.0 P0 - 架构错误（最高优先级）

#### 问题 0：布局结构根本性错误

**现状**（从截图分析）：
```
┌──────────┬──────────────────┬──────────────────┬─────────┐
│ 全局导航  │   会话列表        │    消息区域       │ 话题栏  │
│ (Layout) │ (SessionSidebar) │  (MessageArea)   │(独立栏) │
│          │                  │                  │  # 📖   │
└──────────┴──────────────────┴──────────────────┴─────────┘
```

**问题**：
1. TopicSidebar 作为独立的第三栏存在
2. 折叠后只显示两个图标，功能不明确
3. 三栏 + 全局导航 = 四栏，屏幕拥挤

**设计意图**（重新理解）：
```
┌──────────┬──────────────────┬─────────────────────────────┐
│ 全局导航  │   会话列表        │         消息区域             │
│ (Layout) │ (SessionSidebar) │  ┌─────────────────────────┐ │
│          │                  │  │ Header + 话题选择器 ▼   │ │
│          │                  │  ├─────────────────────────┤ │
│          │                  │  │                         │ │
│          │                  │  │     消息列表             │ │
│          │                  │  │                         │ │
│          │                  │  ├─────────────────────────┤ │
│          │                  │  │     输入框               │ │
│          │                  │  └─────────────────────────┘ │
└──────────┴──────────────────┴─────────────────────────────┘
```

**话题选择器应该是 MessageArea 的一部分**：
- 作为下拉菜单或可展开的面板
- 在 Header 区域点击当前话题名称展开
- 不是独立的第三栏

**修复方案**：

1. **删除独立的 TopicSidebar 栏**，改为内嵌在 MessageArea

2. **修改 ChatLayout.tsx**：
```tsx
// 改为两栏布局
<div className="flex h-full">
  {/* 左侧：会话列表 */}
  <SessionSidebar className="w-80 border-r" />

  {/* 右侧：消息区域（内含话题选择器）*/}
  <MessageArea className="flex-1" />
</div>
```

3. **修改 MessageArea.tsx**，话题选择器内嵌在 Header：
```tsx
<div className="flex flex-col h-full">
  {/* Header：会话名称 + 话题选择器 */}
  <div className="border-b px-4 py-3">
    <div className="flex items-center justify-between">
      <div>
        <h2>{sessionName}</h2>
        {/* 话题选择器：下拉或 Popover */}
        <TopicSelector />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => navigateTopic('prev')}>◀</Button>
        <Button onClick={() => navigateTopic('next')}>▶</Button>
      </div>
    </div>
  </div>

  {/* 消息列表 */}
  <div className="flex-1 overflow-y-auto">...</div>

  {/* 输入框 */}
  <div className="border-t">...</div>
</div>
```

4. **TopicSelector 组件设计**：
```tsx
function TopicSelector() {
  const [open, setOpen] = useState(false);
  const currentTopic = getCurrentTopic();
  const topics = getAllTopicsForSession();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-auto p-0">
          <span className="text-sm text-muted-foreground">
            当前话题：{currentTopic?.name || '点击选择'}
          </span>
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索话题..." />
          <CommandList>
            <CommandEmpty>无匹配话题</CommandEmpty>
            <CommandGroup>
              {topics.map(topic => (
                <CommandItem
                  key={topic.id}
                  onSelect={() => {
                    selectTopic(topic.id);
                    setOpen(false);
                  }}
                >
                  {topic.name}
                  {topic.id === currentTopic?.id && <Check className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="border-t p-2">
            <Button size="sm" variant="outline" className="w-full">
              <Plus className="mr-2 h-4 w-4" /> 新建话题
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

---

#### 问题 0.1：页面高度溢出

**现状**：
- Sessions.tsx 有页面标题和描述文字
- ChatLayout 使用 `h-[calc(100vh-5rem)]`
- 总高度超出视口，需要滚动

**修复方案**：
```tsx
// Sessions.tsx - 移除页面标题，或让 ChatLayout 填满剩余高度
export function Sessions() {
  return (
    <div className="h-full flex flex-col">
      {/* 可选：简洁的标题栏 */}
      <div className="shrink-0 px-4 py-2 border-b">
        <h1 className="text-lg font-semibold">会话</h1>
      </div>
      {/* ChatLayout 填满剩余高度 */}
      <div className="flex-1 min-h-0">
        <ChatLayout />
      </div>
    </div>
  );
}

// ChatLayout.tsx - 使用 h-full 而非固定计算
<div className={cn('flex h-full', className)}>
```

---

### 2.1 P1 - 功能缺失

#### 问题 1：新建会话按钮不可用

**位置**：`SessionSidebar.tsx:52`

**现状**：
```tsx
<Button size="sm" variant="outline" disabled>
  新建
</Button>
```

**修复方案**：
```tsx
const [showCreateDialog, setShowCreateDialog] = useState(false);

<Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
  新建
</Button>

<Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>新建会话</DialogTitle>
    </DialogHeader>
    <SessionCreateForm
      onSuccess={(session) => {
        setShowCreateDialog(false);
        selectSession(session.id);
      }}
    />
  </DialogContent>
</Dialog>
```

---

#### 问题 1.1：移动端无法打开侧边栏抽屉

**位置**：`ChatLayout.tsx`

**现状**：
- 抽屉组件已实现，但没有按钮触发打开
- 用户在移动端无法访问会话列表和话题列表

**设计要求**：
```
- 左侧抽屉：点击汉堡菜单按钮展开会话列表
- 右侧抽屉：点击话题图标按钮展开话题选择器
```

**修复方案**：
```tsx
// MessageArea.tsx 头部添加抽屉触发按钮
<div className="flex items-center gap-2">
  {!isDesktop && (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setLeftDrawerOpen(true)}
    >
      <Menu className="h-5 w-5" />
    </Button>
  )}
  <h2>{headerTitle}</h2>
  {!isDesktop && (
    <Button
      size="icon"
      variant="ghost"
      className="ml-auto"
      onClick={() => setRightDrawerOpen(true)}
    >
      <Hash className="h-5 w-5" />
    </Button>
  )}
</div>
```

---

#### 问题 2：边界滚动无视觉反馈

**位置**：`useScrollBoundary.ts`, `MessageArea.tsx`, `TopicSidebar.tsx`

**现状**：
- Hook 只触发回调，没有返回进度/方向状态
- 用户滚动到边界时没有任何视觉提示

**设计要求**：
当用户在消息区域滚动到边界并继续滚动时，右侧 TopicSidebar 应该：
1. 高亮预览即将切换到的目标话题
2. 显示滚动方向指示（上/下箭头）
3. 随着累积滚动量增加，高亮效果逐渐增强

```
┌─────────────────────────────────────────┐
│ Message Area          │  Topic Sidebar  │
│                       │ ┌─────────────┐ │
│  (滚动到顶部边界)      │ │ ⬆️ Topic 1  │ │  ← 高亮 + 箭头指示
│                       │ ├─────────────┤ │
│  继续向上滚...        │ │ Topic 2 ●   │ │  ← 当前话题
│                       │ ├─────────────┤ │
│                       │ │ Topic 3     │ │
│                       │ └─────────────┘ │
└─────────────────────────────────────────┘
```

**修复方案**：

1. 修改 `useScrollBoundary.ts` 返回进度和方向状态：
```tsx
interface UseScrollBoundaryReturn<T extends HTMLElement> {
  ref: React.RefObject<T>;
  progress: number;                    // 0-100 累积进度
  direction: 'up' | 'down' | null;     // 滚动方向
}

export function useScrollBoundary<T extends HTMLElement>(
  options: UseScrollBoundaryOptions
): UseScrollBoundaryReturn<T> {
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    // ... 边界检测逻辑 ...

    if (isAtTop && e.deltaY < 0) {
      const newProgress = Math.min(100, (accumulatedDelta.current / threshold) * 100);
      setProgress(newProgress);
      setDirection('up');
      if (accumulatedDelta.current >= threshold) {
        onTopBoundary();
        setProgress(0);
        setDirection(null);
      }
    } else if (isAtBottom && e.deltaY > 0) {
      const newProgress = Math.min(100, (accumulatedDelta.current / threshold) * 100);
      setProgress(newProgress);
      setDirection('down');
      // ...
    } else {
      setProgress(0);
      setDirection(null);
    }
  }, [/* deps */]);

  return { ref, progress, direction };
}
```

2. 在 Store 中添加边界状态：
```tsx
// store/chat.ts
interface ChatState {
  // ... 现有状态 ...
  boundaryProgress: number;         // 0-100
  boundaryDirection: 'up' | 'down' | null;
  setBoundaryState: (progress: number, direction: 'up' | 'down' | null) => void;
}
```

3. 修改 `TopicSidebar.tsx` 显示预览高亮：
```tsx
function TopicSidebar() {
  const boundaryProgress = useChatStore(s => s.boundaryProgress);
  const boundaryDirection = useChatStore(s => s.boundaryDirection);
  const currentTopicId = useChatStore(s => s.currentTopicId);
  const topics = getAllTopicsForSession(currentSessionId);

  // 计算预览目标话题
  const currentIndex = topics.findIndex(t => t.id === currentTopicId);
  const previewIndex = boundaryDirection === 'up'
    ? currentIndex - 1
    : boundaryDirection === 'down'
      ? currentIndex + 1
      : -1;
  const previewTopicId = previewIndex >= 0 && previewIndex < topics.length
    ? topics[previewIndex].id
    : null;

  return (
    <div className="...">
      {topics.map((topic, idx) => {
        const isPreview = topic.id === previewTopicId && boundaryProgress > 0;
        const isCurrent = topic.id === currentTopicId;

        return (
          <button
            key={topic.id}
            className={cn(
              'w-full rounded-md px-3 py-2 text-left transition-all',
              isCurrent && 'bg-accent',
              isPreview && 'ring-2 ring-primary/50 bg-primary/10',
            )}
            style={isPreview ? { opacity: 0.5 + (boundaryProgress / 200) } : undefined}
          >
            <div className="flex items-center gap-2">
              {isPreview && boundaryDirection === 'up' && (
                <ChevronUp className="h-3 w-3 text-primary animate-bounce" />
              )}
              {isPreview && boundaryDirection === 'down' && (
                <ChevronDown className="h-3 w-3 text-primary animate-bounce" />
              )}
              <span>{topic.name || '未命名话题'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

4. 在 `MessageArea.tsx` 中同步状态：
```tsx
const { ref, progress, direction } = useScrollBoundary<HTMLDivElement>({
  onTopBoundary: () => navigateTopic('prev'),
  onBottomBoundary: () => navigateTopic('next'),
});

// 同步到 store
useEffect(() => {
  setBoundaryState(progress, direction);
}, [progress, direction]);
```

---

#### 问题 3：搜索和筛选功能未实现

**位置**：`SessionSidebar.tsx`

**现状**：
- 搜索框存在但 `disabled`
- 没有类型筛选（AI/PM/Group）

**设计要求**：
```typescript
// SessionSidebar 子组件
- SessionSearchBar: 搜索框，支持按名称、类型搜索
- SessionFilters: 类型筛选（AI/PM/Group），排序选择
```

**修复方案**：

1. 添加本地过滤状态：
```tsx
const [searchQuery, setSearchQuery] = useState('');
const [typeFilter, setTypeFilter] = useState<string | null>(null);

const filteredSessions = useMemo(() => {
  return sessions.filter(session => {
    const matchesSearch = !searchQuery ||
      session.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !typeFilter || session.type === typeFilter;
    return matchesSearch && matchesType;
  });
}, [sessions, searchQuery, typeFilter]);
```

2. 添加筛选按钮组：
```tsx
<div className="flex gap-1 px-3 py-2 border-b">
  {['ai', 'pm', 'group'].map(type => (
    <Button
      key={type}
      size="sm"
      variant={typeFilter === type ? 'default' : 'outline'}
      onClick={() => setTypeFilter(typeFilter === type ? null : type)}
    >
      {getTypeLabel(type)}
    </Button>
  ))}
</div>
```

---

#### 问题 4：虚拟话题消息未正确加载

**位置**：`store/chat.ts`

**现状**：
- `selectTopic` 直接调用 API 加载消息
- 虚拟话题 ID 为 `virtual-xxx`，API 不支持

**问题代码**：
```typescript
selectTopic: async (topicId: string) => {
  // ...
  await loadMessages(currentSessionId, topicId);  // ❌ 虚拟话题 ID 会导致 API 404
}
```

**修复方案**：
```typescript
selectTopic: async (topicId: string) => {
  const { currentSessionId, loadMessages, virtualTopics, sessionMessages } = get();
  if (!currentSessionId) return;
  set({ currentTopicId: topicId });

  // 判断是否为虚拟话题
  const isVirtual = topicId.startsWith('virtual-');
  if (isVirtual) {
    // 虚拟话题：从 sessionMessages 中筛选
    const vt = virtualTopics[currentSessionId]?.find(t => t.id === topicId);
    if (vt) {
      const allMsgs = sessionMessages[currentSessionId] ?? [];
      const virtualMsgs = getVirtualTopicMessages(vt, allMsgs);
      set(state => ({
        messages: { ...state.messages, [topicId]: virtualMsgs }
      }));
    }
  } else {
    // 真实话题：从 API 加载
    await loadMessages(currentSessionId, topicId);
  }
}
```

---

### 2.2 P1 - 体验问题

#### 问题 5：ContinuousMessageList 渲染效率低

**位置**：`MessageArea.tsx`

**现状**：
```tsx
// 每条消息都单独包装成 SimpleMessageList
items.push(
  <SimpleMessageList
    key={msg.id}
    messages={[msg]}  // ❌ 每条消息一个列表，效率低
    onDelete={onDelete}
  />,
);
```

**问题**：
- 每条消息都创建一个列表组件
- 失去了消息间的样式连续性
- 性能浪费

**修复方案**：
```tsx
function ContinuousMessageList({ messages, topics, onDelete }: ContinuousMessageListProps) {
  // 按话题分组
  const groups = useMemo(() => {
    const result: { topicId: string | null; topicName: string; messages: Message[] }[] = [];
    let currentGroup: Message[] = [];
    let lastTopicId: string | null = null;

    for (const msg of messages) {
      if (msg.topic_id !== lastTopicId) {
        if (currentGroup.length > 0) {
          result.push({
            topicId: lastTopicId,
            topicName: topics.find(t => t.id === lastTopicId)?.name || '未命名话题',
            messages: currentGroup
          });
        }
        currentGroup = [msg];
        lastTopicId = msg.topic_id ?? null;
      } else {
        currentGroup.push(msg);
      }
    }
    if (currentGroup.length > 0) {
      result.push({ topicId: lastTopicId, topicName: '...', messages: currentGroup });
    }
    return result;
  }, [messages, topics]);

  return (
    <div className="space-y-4">
      {groups.map((group, idx) => (
        <div key={group.topicId || idx}>
          {idx > 0 && <TopicDivider topicName={group.topicName} onClick={() => selectTopic(group.topicId!)} />}
          <MessageList messages={group.messages} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}
```

---

#### 问题 6：没有加载状态提示

**位置**：`SessionSidebar.tsx`, `MessageArea.tsx`, `TopicSidebar.tsx`

**现状**：
- `sessionsLoading` 状态存在但未显示 loading UI
- 用户不知道数据是否在加载

**修复方案**：
```tsx
// SessionSidebar.tsx
{sessionsLoading && (
  <div className="space-y-2 px-2 py-2">
    {[1, 2, 3].map(i => (
      <Skeleton key={i} className="h-16 w-full rounded-md" />
    ))}
  </div>
)}

// MessageArea.tsx
const isLoading = messagesLoading[currentTopicId || currentSessionId || ''];
{isLoading && (
  <div className="flex justify-center py-8">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
)}
```

---

#### 问题 7：缺少右键菜单操作

**位置**：`SessionSidebar.tsx`, `TopicSidebar.tsx`

**设计要求**：
```typescript
// SessionItem
onContextMenu: (action: 'edit' | 'delete') => void;

// TopicItem
onEdit?: () => void;
onDelete?: () => void;
```

**修复方案**：使用 shadcn ContextMenu 组件
```tsx
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

<ContextMenu>
  <ContextMenuTrigger asChild>
    <button className="..." onClick={() => selectSession(session.id)}>
      {/* session item content */}
    </button>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onClick={() => handleEdit(session)}>
      <Pencil className="mr-2 h-4 w-4" /> 编辑
    </ContextMenuItem>
    <ContextMenuItem
      className="text-destructive"
      onClick={() => handleDelete(session.id)}
    >
      <Trash2 className="mr-2 h-4 w-4" /> 删除
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

---

### 2.3 P2 - 设计偏离

#### 问题 8：未集成 @lobehub/ui

**设计要求**：
```
- ChatItem: 消息气泡组件，支持 Markdown、代码高亮
- Markdown: 富文本渲染，支持数学公式、代码块
- Avatar: 头像组件，支持用户/AI 区分
- ActionsBar: 消息操作栏（复制、删除等）
```

**现状**：使用自定义 `MessageList` 组件，功能受限

**修复方案**：

1. 安装依赖：
```bash
bun add @lobehub/ui
```

2. 配置 ThemeProvider（参考 `02-COMPONENTS.md`）

3. 替换 MessageItem：
```tsx
import { ChatItem, Markdown, Avatar, ActionsBar } from '@lobehub/ui';

function MessageItem({ message, onDelete, onCopy }: MessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <ChatItem
      avatar={<Avatar src={isUser ? userAvatar : botAvatar} />}
      placement={isUser ? 'right' : 'left'}
      primary={isUser}
      actions={
        <ActionsBar
          items={[
            { key: 'copy', icon: <Copy />, label: '复制' },
            { key: 'delete', icon: <Trash2 />, label: '删除', danger: true },
          ]}
          onActionClick={(key) => {
            if (key === 'copy') onCopy?.();
            if (key === 'delete') onDelete?.();
          }}
        />
      }
    >
      {message.parts.map((part) => (
        <MessagePartRenderer key={part.id} part={part} />
      ))}
    </ChatItem>
  );
}
```

**注意**：@lobehub/ui 需要较大改动，可以作为 Phase 2 或单独任务处理。当前可以先修复功能问题。

---

#### 问题 9：路由未与 URL 同步

**设计要求**：
```
/chat                    // 无选中会话
/chat/:sessionId         // 选中会话
/chat/:sessionId#topic-xxx  // 可选：直接定位到某话题
```

**现状**：`Sessions.tsx` 没有读取 URL 参数

**修复方案**：
```tsx
// pages/Sessions.tsx (或重命名为 Chat.tsx)
import { useParams, useNavigate } from 'react-router-dom';

export function Sessions() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const { selectSession, currentSessionId } = useChatStore();

  // URL → Store 同步
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      selectSession(sessionId);
    }
  }, [sessionId]);

  // Store → URL 同步
  useEffect(() => {
    if (currentSessionId && currentSessionId !== sessionId) {
      navigate(`/sessions/${currentSessionId}`, { replace: true });
    }
  }, [currentSessionId]);

  return <ChatLayout />;
}
```

---

#### 问题 10：Tablet 断点未处理

**设计要求**：
```
- md (768px-1023px): 左栏抽屉，中间+右栏展示
```

**现状**：只区分 desktop vs non-desktop

**修复方案**：
```tsx
const { isDesktop, isTablet, isMobile } = useBreakpoints();

// Tablet: 左侧抽屉，右侧固定
{(isDesktop || isTablet) ? (
  <TopicSidebar className="w-64" />
) : (
  <Drawer>...</Drawer>
)}

// 只有 Mobile 时左栏变抽屉
{isDesktop ? (
  <SessionSidebar className="w-80" />
) : (
  <Drawer>...</Drawer>
)}
```

---

### 2.4 P3 - 优化项

#### 问题 11：新建会话按钮未启用

**位置**：`SessionSidebar.tsx:52`

```tsx
<Button size="sm" variant="outline" disabled>
  新建
</Button>
```

**修复**：复用原 Sessions 页面的新建弹窗逻辑，或使用 Store 的 `createSession`

---

#### 问题 12：Store 方法命名可优化

**现状**：计算属性改为方法避免无限循环
```typescript
getCurrentSession: () => Session | null;
```

**建议**：使用 `zustand/shallow` 或分离选择器优化，但当前实现可用

---

## 3. 实施计划

### Phase 0 - 架构修复（必须首先完成）

| 序号 | 任务 | 涉及文件 | 预计工作量 |
|------|------|----------|-----------|
| 0.1 | 重构布局：TopicSidebar 内嵌到 MessageArea | `ChatLayout.tsx`, `MessageArea.tsx` | 2h |
| 0.2 | 新建 TopicSelector 下拉组件 | 新建 `TopicSelector.tsx` | 1.5h |
| 0.3 | 修复页面高度溢出 | `Sessions.tsx`, `ChatLayout.tsx` | 0.5h |
| 0.4 | 删除或重构 TopicSidebar.tsx | `TopicSidebar.tsx` | 0.5h |

### Phase 1 - 核心功能修复

| 序号 | 任务 | 涉及文件 | 预计工作量 |
|------|------|----------|-----------|
| 1.1 | 新建会话按钮启用 | `SessionSidebar.tsx` | 1h |
| 1.2 | 新建话题功能（在 TopicSelector 中） | `TopicSelector.tsx`, `store/chat.ts` | 1h |
| 1.3 | 虚拟话题消息加载 | `store/chat.ts` | 1h |
| 1.4 | 边界滚动视觉反馈（话题高亮） | `useScrollBoundary.ts`, `TopicSelector.tsx` | 1.5h |

### Phase 2 - 体验优化

| 序号 | 任务 | 涉及文件 | 预计工作量 |
|------|------|----------|-----------|
| 2.1 | 搜索和筛选功能 | `SessionSidebar.tsx` | 1h |
| 2.2 | 加载状态骨架屏 | 多个组件 | 1h |
| 2.3 | 右键菜单（编辑/删除） | `SessionSidebar.tsx` | 1h |
| 2.4 | ContinuousMessageList 优化 | `MessageArea.tsx` | 1h |

### Phase 3 - 响应式与完善

| 序号 | 任务 | 涉及文件 | 预计工作量 |
|------|------|----------|-----------|
| 3.1 | 移动端抽屉模式 | `ChatLayout.tsx`, `MessageArea.tsx` | 1h |
| 3.2 | URL 路由同步 | `Sessions.tsx`, `App.tsx` | 1h |
| 3.3 | Tablet 断点处理 | `ChatLayout.tsx` | 0.5h |

---

## 4. 依赖关系

```
Phase 0 (架构修复) ─────────────────────────────────────────┐
    │                                                       │
    ├── 0.1 布局重构 ──┬── 0.2 TopicSelector ──┐            │
    │                  │                       │            │
    │                  └── 0.4 删除旧组件 ─────┤            │
    │                                          │            │
    └── 0.3 高度修复 ──────────────────────────┴────────────┘
                                                            │
                                                            ▼
Phase 1 (功能修复) ─── 依赖 Phase 0 完成 ───────────────────┐
    │                                                       │
    ├── 1.1 新建会话                                        │
    ├── 1.2 新建话题 (在 TopicSelector)                     │
    ├── 1.3 虚拟话题                                        │
    └── 1.4 边界滚动反馈                                    │
                                                            │
                                                            ▼
Phase 2-3 (体验优化) ─── 可并行 ────────────────────────────┘
```

---

## 5. 快速启动建议

**必须先完成 Phase 0**，因为当前架构与设计意图不符：

1. **Phase 0.1 + 0.2**：重构为两栏布局 + 内嵌话题选择器
2. **Phase 0.3**：修复页面高度问题
3. **Phase 1.1 + 1.2**：启用新建会话/话题功能

完成这些后，基本功能才能正常使用。

---

## 6. 设计文档澄清

原始设计文档 `01-ARCHITECTURE.md` 中的三栏布局描述：

```
│   Session    │        Message Area            │     Topic Selector      │
│    List      │                                │     (可折叠)             │
```

**应该理解为**：
- Session List 是独立的左栏
- Message Area + Topic Selector 是右栏的整体
- Topic Selector 是 Message Area 内部的可折叠组件
- **不是**三个平级的独立栏

建议更新原始设计文档以消除歧义。
