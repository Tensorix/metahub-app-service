# Chat Redesign - 状态管理

## 状态架构

使用 Zustand 管理会话相关状态，与现有 `auth.ts` 和 `theme.ts` 保持一致。

---

## Store 设计

### chatStore

```typescript
// store/chat.ts
import { create } from 'zustand';
import { sessionApi, type Session, type Topic, type Message } from '@/lib/api';
import { computeVirtualTopics } from '@/lib/virtualTopic';

interface ChatState {
  // ===== 会话列表 =====
  sessions: Session[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  // ===== 当前选中 =====
  currentSessionId: string | null;
  currentTopicId: string | null;  // 当前显示的话题

  // ===== 话题数据 =====
  topics: Record<string, Topic[]>;  // sessionId -> Topic[]
  topicsLoading: Record<string, boolean>;

  // ===== 虚拟话题 =====
  virtualTopics: Record<string, Topic[]>;  // sessionId -> VirtualTopic[]

  // ===== 消息数据 =====
  messages: Record<string, Message[]>;  // topicId -> Message[]
  messagesLoading: Record<string, boolean>;

  // ===== 连续模式消息 =====
  sessionMessages: Record<string, Message[]>;  // sessionId -> all messages

  // ===== UI 状态 =====
  topicSidebarCollapsed: boolean;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;

  // ===== 计算属性 =====
  get currentSession(): Session | null;
  get currentTopic(): Topic | null;
  get displayMode(): 'paged' | 'continuous';
  get allTopicsForSession(): Topic[];  // 真实话题 + 虚拟话题

  // ===== Actions =====
  // 会话
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => void;
  createSession: (data: SessionCreate) => Promise<Session>;
  updateSession: (sessionId: string, data: SessionUpdate) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;

  // 话题
  loadTopics: (sessionId: string) => Promise<void>;
  selectTopic: (topicId: string) => void;
  createTopic: (sessionId: string, name?: string) => Promise<Topic>;
  updateTopic: (topicId: string, data: TopicUpdate) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  navigateTopic: (direction: 'prev' | 'next') => void;

  // 消息
  loadMessages: (sessionId: string, topicId?: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  // UI
  setTopicSidebarCollapsed: (collapsed: boolean) => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
}
```

---

## Store 实现

```typescript
// store/chat.ts
export const useChatStore = create<ChatState>((set, get) => ({
  // ===== 初始状态 =====
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,
  currentSessionId: null,
  currentTopicId: null,
  topics: {},
  topicsLoading: {},
  virtualTopics: {},
  messages: {},
  messagesLoading: {},
  sessionMessages: {},
  topicSidebarCollapsed: false,
  leftDrawerOpen: false,
  rightDrawerOpen: false,

  // ===== 计算属性 =====
  get currentSession() {
    const { sessions, currentSessionId } = get();
    return sessions.find(s => s.id === currentSessionId) || null;
  },

  get currentTopic() {
    const { currentTopicId, topics, virtualTopics, currentSessionId } = get();
    if (!currentTopicId || !currentSessionId) return null;

    const allTopics = [
      ...(topics[currentSessionId] || []),
      ...(virtualTopics[currentSessionId] || [])
    ];
    return allTopics.find(t => t.id === currentTopicId) || null;
  },

  get displayMode() {
    const session = get().currentSession;
    return session?.type === 'ai' ? 'paged' : 'continuous';
  },

  get allTopicsForSession() {
    const { currentSessionId, topics, virtualTopics } = get();
    if (!currentSessionId) return [];
    return [
      ...(topics[currentSessionId] || []),
      ...(virtualTopics[currentSessionId] || [])
    ].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  },

  // ===== 会话 Actions =====
  loadSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const response = await sessionApi.getSessions({ page: 1, size: 100 });
      set({ sessions: response.items });
    } catch (error) {
      set({ sessionsError: '加载会话失败' });
    } finally {
      set({ sessionsLoading: false });
    }
  },

  selectSession: async (sessionId: string) => {
    const { topics, loadTopics, loadMessages, currentSessionId } = get();

    // 更新选中状态
    set({
      currentSessionId: sessionId,
      currentTopicId: null  // 重置话题选择
    });

    // 加载话题（如果未加载）
    if (!topics[sessionId]) {
      await loadTopics(sessionId);
    }

    // 获取 session 类型决定加载策略
    const session = get().sessions.find(s => s.id === sessionId);
    if (session?.type === 'ai') {
      // 分页模式：自动选中第一个话题
      const sessionTopics = get().topics[sessionId] || [];
      if (sessionTopics.length > 0) {
        set({ currentTopicId: sessionTopics[0].id });
        await loadMessages(sessionId, sessionTopics[0].id);
      }
    } else {
      // 连续模式：加载所有消息
      await loadMessages(sessionId);
    }
  },

  createSession: async (data) => {
    const session = await sessionApi.createSession(data);
    set(state => ({ sessions: [session, ...state.sessions] }));
    return session;
  },

  updateSession: async (sessionId, data) => {
    await sessionApi.updateSession(sessionId, data);
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId ? { ...s, ...data } : s
      )
    }));
  },

  deleteSession: async (sessionId) => {
    await sessionApi.deleteSession(sessionId);
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== sessionId),
      currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
    }));
  },

  // ===== 话题 Actions =====
  loadTopics: async (sessionId: string) => {
    set(state => ({
      topicsLoading: { ...state.topicsLoading, [sessionId]: true }
    }));

    try {
      const topicList = await sessionApi.getTopics(sessionId);
      set(state => ({
        topics: { ...state.topics, [sessionId]: topicList }
      }));

      // 同时加载所有消息以计算虚拟话题
      const allMessages = await sessionApi.getMessages(sessionId, { size: 1000 });

      // 计算虚拟话题
      const virtualTopicList = computeVirtualTopics(
        allMessages.items.filter(m => !m.topic_id),
        sessionId
      );
      set(state => ({
        virtualTopics: { ...state.virtualTopics, [sessionId]: virtualTopicList },
        sessionMessages: { ...state.sessionMessages, [sessionId]: allMessages.items }
      }));

    } finally {
      set(state => ({
        topicsLoading: { ...state.topicsLoading, [sessionId]: false }
      }));
    }
  },

  selectTopic: (topicId: string) => {
    const { currentSessionId, loadMessages } = get();
    set({ currentTopicId: topicId });

    if (currentSessionId) {
      loadMessages(currentSessionId, topicId);
    }
  },

  navigateTopic: (direction: 'prev' | 'next') => {
    const { allTopicsForSession, currentTopicId, selectTopic, createTopic, currentSessionId } = get();
    const currentIndex = allTopicsForSession.findIndex(t => t.id === currentTopicId);

    if (direction === 'prev' && currentIndex > 0) {
      selectTopic(allTopicsForSession[currentIndex - 1].id);
    } else if (direction === 'next') {
      if (currentIndex < allTopicsForSession.length - 1) {
        selectTopic(allTopicsForSession[currentIndex + 1].id);
      } else {
        // 最后一个话题，准备新建
        // 实际新建在发送消息时触发
      }
    }
  },

  createTopic: async (sessionId, name) => {
    const topic = await sessionApi.createTopic(sessionId, {
      name: name || `新话题 ${new Date().toLocaleString('zh-CN')}`,
      session_id: sessionId
    });

    set(state => ({
      topics: {
        ...state.topics,
        [sessionId]: [...(state.topics[sessionId] || []), topic]
      }
    }));

    return topic;
  },

  // ===== 消息 Actions =====
  loadMessages: async (sessionId: string, topicId?: string) => {
    const key = topicId || sessionId;
    set(state => ({
      messagesLoading: { ...state.messagesLoading, [key]: true }
    }));

    try {
      const params = topicId ? { topic_id: topicId, size: 100 } : { size: 1000 };
      const response = await sessionApi.getMessages(sessionId, params);

      if (topicId) {
        set(state => ({
          messages: { ...state.messages, [topicId]: response.items }
        }));
      } else {
        set(state => ({
          sessionMessages: { ...state.sessionMessages, [sessionId]: response.items }
        }));
      }
    } finally {
      set(state => ({
        messagesLoading: { ...state.messagesLoading, [key]: false }
      }));
    }
  },

  sendMessage: async (content: string) => {
    const { currentSessionId, currentTopicId, displayMode, createTopic, loadMessages } = get();
    if (!currentSessionId) return;

    let topicId = currentTopicId;

    // AI 模式：如果没有当前话题，自动创建
    if (displayMode === 'paged' && !topicId) {
      const newTopic = await createTopic(
        currentSessionId,
        content.slice(0, 30) + (content.length > 30 ? '...' : '')
      );
      topicId = newTopic.id;
      set({ currentTopicId: topicId });
    }

    await sessionApi.createMessage(currentSessionId, {
      session_id: currentSessionId,
      topic_id: topicId || undefined,
      role: 'user',
      parts: [{ type: 'text', content }]
    });

    // 重新加载消息
    await loadMessages(currentSessionId, topicId || undefined);
  },

  // ===== UI Actions =====
  setTopicSidebarCollapsed: (collapsed) => set({ topicSidebarCollapsed: collapsed }),
  setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
  setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
}));
```

---

## 虚拟话题工具

```typescript
// lib/virtualTopic.ts
import type { Message, Topic } from './api';

const VIRTUAL_TOPIC_TIME_GAP = 30 * 60 * 1000; // 30 分钟

export interface VirtualTopic extends Topic {
  is_virtual: true;
  message_ids: string[];
}

/**
 * 根据孤立消息计算虚拟话题
 * 按时间间隔 30 分钟分组
 */
export function computeVirtualTopics(
  orphanMessages: Message[],
  sessionId: string
): VirtualTopic[] {
  if (orphanMessages.length === 0) return [];

  // 按时间排序
  const sorted = [...orphanMessages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const groups: Message[][] = [];
  let currentGroup: Message[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].created_at).getTime();
    const currTime = new Date(sorted[i].created_at).getTime();

    if (currTime - prevTime > VIRTUAL_TOPIC_TIME_GAP) {
      // 超过间隔，开始新组
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    } else {
      currentGroup.push(sorted[i]);
    }
  }
  groups.push(currentGroup);

  // 转换为虚拟话题
  return groups.map((group, index) => {
    const firstMsg = group[0];
    const date = new Date(firstMsg.created_at);
    const dateStr = date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return {
      id: `virtual-${sessionId}-${index}`,
      name: `历史对话 ${dateStr}`,
      session_id: sessionId,
      created_at: firstMsg.created_at,
      updated_at: group[group.length - 1].created_at,
      is_deleted: false,
      is_virtual: true,
      message_ids: group.map(m => m.id)
    } as VirtualTopic;
  });
}

/**
 * 获取虚拟话题的消息
 */
export function getVirtualTopicMessages(
  virtualTopic: VirtualTopic,
  allMessages: Message[]
): Message[] {
  const messageIdSet = new Set(virtualTopic.message_ids);
  return allMessages.filter(m => messageIdSet.has(m.id));
}
```

---

## 自定义 Hooks

### useScrollBoundary

检测滚动边界，用于分页模式话题切换。

```typescript
// hooks/useScrollBoundary.ts
import { useRef, useEffect, useCallback } from 'react';

interface UseScrollBoundaryOptions {
  threshold?: number;    // 累积滚动阈值，默认 100
  debounceMs?: number;   // 防抖时间，默认 300
  onTopBoundary: () => void;
  onBottomBoundary: () => void;
}

export function useScrollBoundary<T extends HTMLElement>(
  options: UseScrollBoundaryOptions
) {
  const ref = useRef<T>(null);
  const accumulatedDelta = useRef(0);
  const lastScrollTime = useRef(0);

  const {
    threshold = 100,
    debounceMs = 300,
    onTopBoundary,
    onBottomBoundary
  } = options;

  const handleWheel = useCallback((e: WheelEvent) => {
    const el = ref.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const isAtTop = scrollTop <= 0;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

    const now = Date.now();
    if (now - lastScrollTime.current > debounceMs) {
      accumulatedDelta.current = 0;
    }
    lastScrollTime.current = now;

    if (isAtTop && e.deltaY < 0) {
      e.preventDefault();
      accumulatedDelta.current += Math.abs(e.deltaY);
      if (accumulatedDelta.current >= threshold) {
        onTopBoundary();
        accumulatedDelta.current = 0;
      }
    } else if (isAtBottom && e.deltaY > 0) {
      e.preventDefault();
      accumulatedDelta.current += Math.abs(e.deltaY);
      if (accumulatedDelta.current >= threshold) {
        onBottomBoundary();
        accumulatedDelta.current = 0;
      }
    } else {
      accumulatedDelta.current = 0;
    }
  }, [threshold, debounceMs, onTopBoundary, onBottomBoundary]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return ref;
}
```

### useMediaQuery

响应式断点检测。

```typescript
// hooks/useMediaQuery.ts
import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// 预定义断点
export function useBreakpoints() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isMobile = !isTablet;

  return { isDesktop, isTablet, isMobile };
}
```

---

## 数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           useChatStore                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   sessions ◄─────── loadSessions() ◄─────── API: GET /sessions      │
│      │                                                               │
│      ▼                                                               │
│   selectSession(id) ────────────────────┐                           │
│      │                                   │                           │
│      ▼                                   ▼                           │
│   currentSessionId ────► loadTopics() ─► topics[sessionId]          │
│      │                        │                 │                    │
│      │                        │                 ▼                    │
│      │                        └──────► computeVirtualTopics()        │
│      │                                          │                    │
│      │                                          ▼                    │
│      │                              virtualTopics[sessionId]         │
│      │                                                               │
│      ▼                                                               │
│   displayMode ◄── session.type                                       │
│      │                                                               │
│      ├── 'paged' ──────► selectTopic(id) ──► loadMessages(topicId)  │
│      │                                               │               │
│      │                                               ▼               │
│      │                                       messages[topicId]       │
│      │                                                               │
│      └── 'continuous' ──► loadMessages(sessionId)                   │
│                                   │                                  │
│                                   ▼                                  │
│                           sessionMessages[sessionId]                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          UI Components                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   SessionSidebar                                                     │
│       │                                                              │
│       └──► sessions ──► SessionItem.onClick() ──► selectSession()   │
│                                                                      │
│   MessageArea                                                        │
│       │                                                              │
│       ├── displayMode === 'paged'                                   │
│       │       │                                                      │
│       │       └──► PagedMessageList                                 │
│       │               │                                              │
│       │               ├── messages[currentTopicId]                  │
│       │               └── onScroll ──► useScrollBoundary            │
│       │                       │            │                         │
│       │                       │            ├── onTopBoundary         │
│       │                       │            │      └── navigateTopic('prev')
│       │                       │            └── onBottomBoundary      │
│       │                       │                   └── navigateTopic('next')
│       │                       │                                      │
│       └── displayMode === 'continuous'                              │
│               │                                                      │
│               └──► ContinuousMessageList                            │
│                       │                                              │
│                       └── sessionMessages[currentSessionId]         │
│                               │                                      │
│                               └── renderWithDividers()              │
│                                                                      │
│   TopicSidebar                                                       │
│       │                                                              │
│       └──► allTopicsForSession ──► TopicItem.onClick() ──► selectTopic()
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 持久化策略

| 数据 | 存储方式 | 说明 |
|------|---------|------|
| 会话列表 | API | 每次进入页面从服务器加载 |
| 话题列表 | API | 选中会话时加载 |
| 虚拟话题 | 内存 | 根据孤立消息实时计算，不持久化 |
| 消息列表 | API | 按需加载 |
| UI 状态 | 内存 | 侧边栏折叠状态等 |
| 当前选中 | URL | sessionId 通过路由参数传递 |

---

## URL 状态同步

```typescript
// 路由结构
/chat                    // 无选中会话
/chat/:sessionId         // 选中会话（话题自动选第一个或从 hash 读取）
/chat/:sessionId#topic-xxx  // 可选：直接定位到某话题

// 在 Chat 页面中同步
function Chat() {
  const { sessionId } = useParams();
  const { selectSession } = useChatStore();

  useEffect(() => {
    if (sessionId) {
      selectSession(sessionId);
    }
  }, [sessionId]);

  // ...
}
```
