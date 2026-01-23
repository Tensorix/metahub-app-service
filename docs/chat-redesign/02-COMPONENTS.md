# Chat Redesign - 组件设计

## 组件层级总览

```
<ChatLayout>
  ├── <SessionSidebar>                 # 左栏：会话列表
  │     ├── <SessionSearchBar />       # 搜索框
  │     ├── <SessionFilters />         # 类型筛选
  │     └── <SessionList>
  │           └── <SessionItem />      # 单个会话
  │
  ├── <MessageArea>                    # 中栏：消息区域
  │     ├── <MessageHeader />          # 顶部：当前会话/话题信息
  │     ├── <MessageList>              # 消息列表
  │     │     ├── <TopicDivider />     # 话题分隔线（连续模式）
  │     │     └── <MessageItem />      # 单条消息
  │     └── <MessageInput />           # 底部：输入框
  │
  └── <TopicSidebar>                   # 右栏：话题选择器
        ├── <TopicHeader />            # 标题和折叠按钮
        ├── <TopicList>
        │     └── <TopicItem />        # 单个话题
        └── <TopicCreateButton />      # 新建话题
</ChatLayout>
```

---

## 核心组件设计

### ChatLayout

三栏布局容器，处理响应式逻辑。

```typescript
interface ChatLayoutProps {
  children?: React.ReactNode;
}

// 状态
const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

// 响应式断点检测
const isDesktop = useMediaQuery('(min-width: 1024px)');
const isTablet = useMediaQuery('(min-width: 768px)');
```

**布局结构**：
```tsx
<div className="flex h-screen">
  {/* 左侧：会话列表 */}
  {isDesktop ? (
    <SessionSidebar className="w-80 border-r" />
  ) : (
    <Drawer open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen}>
      <SessionSidebar />
    </Drawer>
  )}

  {/* 中间：消息区域 */}
  <MessageArea className="flex-1" />

  {/* 右侧：话题选择器 */}
  {isDesktop ? (
    <TopicSidebar
      className="w-64 border-l"
      collapsible
    />
  ) : (
    <Drawer
      side="right"
      open={rightDrawerOpen}
      onOpenChange={setRightDrawerOpen}
    >
      <TopicSidebar />
    </Drawer>
  )}
</div>
```

---

### SessionSidebar

左侧会话列表侧边栏。

```typescript
interface SessionSidebarProps {
  className?: string;
  onSessionSelect?: (sessionId: string) => void;
}
```

**子组件**：
- `SessionSearchBar`: 搜索框，支持按名称、类型搜索
- `SessionFilters`: 类型筛选（AI/PM/Group），排序选择
- `SessionList`: 会话列表容器
- `SessionItem`: 单个会话项

**SessionItem 设计**：
```typescript
interface SessionItemProps {
  session: Session;
  isSelected: boolean;
  unreadCount: number;
  onSelect: () => void;
  onContextMenu: (action: 'edit' | 'delete') => void;
}
```

显示内容：
- 会话名称（或"未命名会话"）
- 类型标签（AI 紫色、PM 蓝色、Group 绿色）
- 未读数量徽章
- 最后活跃时间
- 右键菜单：编辑、删除

---

### MessageArea

中间消息区域，核心交互区。

```typescript
interface MessageAreaProps {
  className?: string;
}

// 内部状态
const {
  currentSession,
  currentTopic,
  topics,
  messages,
  displayMode  // 'paged' | 'continuous'
} = useChatStore();
```

**结构**：
```tsx
<div className="flex flex-col h-full">
  {/* 顶部栏 */}
  <MessageHeader />

  {/* 消息列表 */}
  <div className="flex-1 overflow-hidden">
    {displayMode === 'paged' ? (
      <PagedMessageList />
    ) : (
      <ContinuousMessageList />
    )}
  </div>

  {/* 输入框 */}
  <MessageInput />
</div>
```

---

### PagedMessageList（AI 类型专用）

分页模式消息列表，每次显示一个话题。

```typescript
interface PagedMessageListProps {
  messages: Message[];
  topicId: string;
  onPrevTopic: () => void;
  onNextTopic: () => void;
  hasNextTopic: boolean;
  hasPrevTopic: boolean;
}
```

**边界滚动检测 Hook**：
```typescript
function useScrollBoundary(ref: RefObject<HTMLElement>, options: {
  threshold: number;      // 触发阈值（累积滚动量）
  debounce: number;       // 防抖时间
  onTopBoundary: () => void;
  onBottomBoundary: () => void;
});
```

**实现逻辑**：
```typescript
const handleWheel = (e: WheelEvent) => {
  const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
  const isAtTop = scrollTop === 0;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

  if (isAtTop && e.deltaY < 0) {
    // 在顶部继续向上滚
    accumulatedDelta.current += Math.abs(e.deltaY);
    if (accumulatedDelta.current > threshold) {
      onPrevTopic();
      accumulatedDelta.current = 0;
    }
  } else if (isAtBottom && e.deltaY > 0) {
    // 在底部继续向下滚
    accumulatedDelta.current += Math.abs(e.deltaY);
    if (accumulatedDelta.current > threshold) {
      onNextTopic(); // 或新建话题
      accumulatedDelta.current = 0;
    }
  } else {
    accumulatedDelta.current = 0;
  }
};
```

**视觉反馈 - 进度条**：

当用户在边界继续滚动时，显示累积进度条：

```
顶部边界状态：
┌─────────────────────────────────────────┐
│  ══════════▓▓▓▓▓▓░░░░░░░══════════      │  ← 进度条（随滚动累积填充）
│  ⬆️ 上一话题: "讨论 API 设计"             │  ← 目标话题名称
├─────────────────────────────────────────┤
│  ... 消息内容 ...                        │
└─────────────────────────────────────────┘

底部边界状态：
┌─────────────────────────────────────────┐
│  ... 消息内容 ...                        │
├─────────────────────────────────────────┤
│  ⬇️ 下一话题: "代码审查反馈"              │  ← 目标话题名称（或"新建话题"）
│  ══════════▓▓▓▓▓▓▓▓▓▓▓▓░░══════════     │  ← 进度条
└─────────────────────────────────────────┘
```

**进度条组件**：
```typescript
interface BoundaryProgressProps {
  direction: 'up' | 'down';
  progress: number;  // 0-100
  targetTopicName?: string;
  isNewTopic?: boolean;
}

function BoundaryProgress({ direction, progress, targetTopicName, isNewTopic }: BoundaryProgressProps) {
  if (progress === 0) return null;

  return (
    <div className={cn(
      "absolute left-0 right-0 p-3 bg-background/95 backdrop-blur",
      "border-b transition-all duration-200",
      direction === 'up' ? 'top-0' : 'bottom-0'
    )}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        {direction === 'up' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        <span>
          {isNewTopic ? '新建话题' : `切换到: ${targetTopicName}`}
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

---

### ContinuousMessageList（PM/Group 类型专用）

连续模式消息列表，所有消息连续显示。

```typescript
interface ContinuousMessageListProps {
  messages: Message[];
  topics: Topic[];
  onTopicClick: (topicId: string) => void;  // 点击分隔线跳转
}
```

**渲染逻辑**：
```typescript
function renderMessagesWithDividers(messages: Message[], topics: Topic[]) {
  const result: React.ReactNode[] = [];
  let lastTopicId: string | null = null;

  messages.forEach((msg, index) => {
    // 检测话题变化，插入分隔线
    if (msg.topic_id !== lastTopicId && msg.topic_id) {
      const topic = topics.find(t => t.id === msg.topic_id);
      result.push(
        <TopicDivider
          key={`divider-${msg.topic_id}`}
          topicName={topic?.name || '未命名话题'}
          topicId={msg.topic_id}
          onClick={() => onTopicClick(msg.topic_id)}
        />
      );
    }

    result.push(<MessageItem key={msg.id} message={msg} />);
    lastTopicId = msg.topic_id;
  });

  return result;
}
```

---

### TopicDivider

话题分隔线组件。

```typescript
interface TopicDividerProps {
  topicName: string;
  topicId: string;
  onClick?: () => void;
}
```

**样式**：
```tsx
<div
  className="flex items-center gap-4 py-4 cursor-pointer hover:bg-muted/50"
  onClick={onClick}
>
  <div className="flex-1 h-px bg-border" />
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Hash className="h-4 w-4" />
    <span>{topicName}</span>
  </div>
  <div className="flex-1 h-px bg-border" />
</div>
```

---

### MessageItem

单条消息组件，使用 lobeui 的 ChatItem。

```typescript
interface MessageItemProps {
  message: Message;
  onDelete?: () => void;
  onCopy?: () => void;
}
```

**使用 lobeui**：
```tsx
import { ChatItem, Markdown } from '@lobehub/ui';

function MessageItem({ message, onDelete, onCopy }: MessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <ChatItem
      avatar={isUser ? userAvatar : assistantAvatar}
      placement={isUser ? 'right' : 'left'}
      primary={message.role === 'user'}
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

function MessagePartRenderer({ part }: { part: MessagePart }) {
  switch (part.type) {
    case 'text':
      return <Markdown>{part.content}</Markdown>;
    case 'image':
      return <img src={part.content} alt="" className="max-w-sm rounded" />;
    case 'url':
      return <a href={part.content} target="_blank">{part.content}</a>;
    case 'json':
      return <pre>{JSON.stringify(JSON.parse(part.content), null, 2)}</pre>;
    default:
      return <p>{part.content}</p>;
  }
}
```

---

### TopicSidebar

右侧话题选择器。

```typescript
interface TopicSidebarProps {
  className?: string;
  collapsible?: boolean;
}

// 内部状态
const [collapsed, setCollapsed] = useState(false);
```

**结构**：
```tsx
<div className={cn(
  "flex flex-col h-full",
  collapsed ? "w-12" : "w-64",
  className
)}>
  {/* 头部 */}
  <TopicHeader
    collapsed={collapsed}
    onToggle={() => setCollapsed(!collapsed)}
  />

  {/* 话题列表 */}
  {!collapsed && (
    <>
      <TopicList />
      <TopicCreateButton />
    </>
  )}
</div>
```

---

### TopicItem

话题列表项。

```typescript
interface TopicItemProps {
  topic: Topic;
  isActive: boolean;
  isVirtual?: boolean;  // 虚拟话题标识
  messageCount?: number;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}
```

**显示内容**：
- 话题名称（虚拟话题显示"历史对话 YYYY-MM-DD"）
- 消息数量
- 虚拟话题标识（如半透明或虚线边框）
- 右键菜单：编辑、删除（虚拟话题不显示）

---

### MessageInput

消息输入组件。

```typescript
interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}
```

**功能**：
- 多行输入（自动扩展高度）
- Enter 发送，Shift+Enter 换行
- 发送中禁用状态
- 支持 @ 提及（可选）
- 支持图片上传（可选）

**自动创建话题逻辑**：
当在 AI 类型会话中发送消息，且没有当前话题时：
1. 调用 API 创建新话题（可以用消息内容生成话题名）
2. 消息关联到新话题
3. 切换到新话题视图

---

## lobeui 集成指南

### 安装

```bash
cd frontend
npm install @lobehub/ui
```

### 主题配置

lobeui 使用 CSS 变量进行主题定制，需要与现有 Tailwind 主题对齐。

```css
/* index.css */
:root {
  /* lobeui 使用的 CSS 变量 */
  --lobe-markdown-background: var(--background);
  --lobe-markdown-foreground: var(--foreground);
  /* ... */
}
```

### Provider 配置

```tsx
// App.tsx
import { ThemeProvider as LobeThemeProvider } from '@lobehub/ui';

function App() {
  const { theme } = useTheme();

  return (
    <LobeThemeProvider themeMode={theme}>
      <RouterProvider router={router} />
    </LobeThemeProvider>
  );
}
```

---

## 组件优先级

### Phase 1（MVP）
1. `ChatLayout` - 三栏布局框架
2. `SessionSidebar` + `SessionItem` - 会话列表
3. `MessageArea` + `MessageList` - 消息显示
4. `MessageInput` - 消息输入
5. `TopicSidebar` + `TopicItem` - 话题选择器

### Phase 2（增强）
1. `PagedMessageList` - AI 分页模式
2. `ContinuousMessageList` + `TopicDivider` - 连续模式
3. 边界滚动切换逻辑
4. 虚拟话题处理

### Phase 3（优化）
1. 响应式抽屉模式
2. 动画效果
3. 快捷键支持
4. 性能优化（虚拟滚动）
