import { create, type StoreApi } from 'zustand';
import {
  sessionApi,
  sandboxApi,
  type Session,
  type Topic,
  type Message,
  type MessageCreate,
  type SandboxInfo,
  type SandboxMount,
} from '@/lib/api';
import { computeVirtualTopics, type VirtualTopic } from '@/lib/virtualTopic';
import { chatWithAgentStream, chatResumeStream, stopGeneration as apiStopGeneration, getStreamStatus, reconnectStream } from '@/lib/agentApi';
import { processStreamEvent, createInitialState } from '@/lib/streamEventProcessor';
import type { ChatEvent } from '@/types/agent';

const STREAM_SNAPSHOT_KEY = 'chat.activeStreamSnapshot.v1';
type StoreSet = StoreApi<ChatState>['setState'];

interface ActiveStreamSnapshot {
  sessionId: string;
  topicId: string;
  assistantTempMessageId: string;
  lastEventId: number;
  startedAt: string;
  status: 'streaming' | 'completed' | 'error' | 'cancelled' | 'interrupt';
}

function readStreamSnapshot(): ActiveStreamSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STREAM_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as ActiveStreamSnapshot) : null;
  } catch {
    return null;
  }
}

function writeStreamSnapshot(snapshot: ActiveStreamSnapshot): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STREAM_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

function clearStreamSnapshot(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STREAM_SNAPSHOT_KEY);
}

async function consumeStreamEvents(params: {
  eventSource: AsyncGenerator<ChatEvent & { _eventId?: number }>;
  initialMessage: Message;
  initialState: ReturnType<typeof createInitialState>;
  aiMessageId: string;
  topicKey: string;
  topicId: string;
  sessionId: string;
  set: StoreSet;
  get: () => ChatState;
  onSnapshotEventId?: (eventId: number) => void;
}): Promise<{ receivedDone: boolean }> {
  const {
    eventSource,
    initialMessage,
    initialState,
    aiMessageId,
    topicKey,
    topicId,
    sessionId,
    set,
    get,
    onSnapshotEventId,
  } = params;

  let currentMsg = initialMessage;
  let proc = initialState;
  let receivedDone = false;
  let rafPending = false;

  const updateMsg = (msg: Message) => {
    set((state) => {
      const msgs = state.messages[topicKey] || [];
      const idx = msgs.findIndex((m) => m.id === aiMessageId);
      if (idx === -1) {
        return { messages: { ...state.messages, [topicKey]: [...msgs, msg] } };
      }
      const updated = [...msgs];
      updated[idx] = msg;
      return { messages: { ...state.messages, [topicKey]: updated } };
    });
  };

  for await (const event of eventSource) {
    if (event._eventId !== undefined) {
      onSnapshotEventId?.(event._eventId);
    }

    if (event.event === 'stream_expired') {
      clearStreamSnapshot();
      receivedDone = true;
      set({ isStreaming: false, streamingMessageId: null, abortController: null, isRecoveringStream: false });
      await get().loadMessages(sessionId, topicId);
      break;
    }

    const result = processStreamEvent(currentMsg, event, proc);
    currentMsg = result.message;
    proc = result.state;

    if (event.event === 'message' || event.event === 'thinking') {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          updateMsg(currentMsg);
          rafPending = false;
        });
      }
    } else {
      updateMsg(currentMsg);
    }

    if (result.effects.isThinking !== undefined) {
      set({ isThinking: result.effects.isThinking });
    }
    if (result.effects.interrupt) {
      set({
        pendingInterrupt: result.effects.interrupt,
        isStreaming: false,
        streamingMessageId: null,
        abortController: null,
        isRecoveringStream: false,
      });
      writeStreamSnapshot({
        sessionId,
        topicId,
        assistantTempMessageId: aiMessageId,
        lastEventId: readStreamSnapshot()?.lastEventId ?? 0,
        startedAt: readStreamSnapshot()?.startedAt ?? new Date().toISOString(),
        status: 'interrupt',
      });
      receivedDone = true;
    }
    if (result.effects.error) {
      set({ streamError: result.effects.error });
      clearStreamSnapshot();
    }
    if (result.effects.done) {
      receivedDone = true;
      clearStreamSnapshot();
      set({
        isStreaming: false,
        streamingMessageId: null,
        abortController: null,
        pendingInterrupt: null,
        isRecoveringStream: false,
      });
      await get().loadMessages(sessionId, topicId);
    }
  }

  return { receivedDone };
}

interface ChatState {
  // ===== 会话列表 =====
  sessions: Session[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  // ===== 当前选中 =====
  currentSessionId: string | null;
  currentTopicId: string | null; // 当前显示的话题

  // ===== 话题数据 =====
  topics: Record<string, Topic[]>; // sessionId -> Topic[]
  topicsLoading: Record<string, boolean>;

  // ===== 虚拟话题 =====
  virtualTopics: Record<string, VirtualTopic[]>; // sessionId -> VirtualTopic[]

  // ===== 消息数据 =====
  messages: Record<string, Message[]>; // topicId -> Message[]
  messagesLoading: Record<string, boolean>;

  // ===== 连续模式消息 =====
  sessionMessages: Record<string, Message[]>; // sessionId -> all messages

  // ===== UI 状态 =====
  topicSidebarCollapsed: boolean;
  fileExplorerOpen: boolean; // 右侧窗格/抽屉展示文件系统而非话题列表
  sandboxPanelOpen: boolean; // 右侧窗格展示 Sandbox 面板（Config / Terminal / Browser）
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  boundaryProgress: number; // 0-100
  boundaryDirection: 'up' | 'down' | null;

  // ===== AI 对话状态 =====
  isStreaming: boolean;
  streamingMessageId: string | null;
  isThinking: boolean;
  abortController: AbortController | null;
  streamError: string | null;
  isRecoveringStream: boolean;

  /** 人机协作：待批准的工具调用 */
  pendingInterrupt: {
    action_requests: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
    review_configs: Array<{ action_name: string; allowed_decisions?: string[] }>;
  } | null;

  // ===== Sandbox 状态 =====
  sandboxStatus: Record<string, SandboxInfo | null>; // keyed by sessionId
  sandboxLoading: Record<string, boolean>;

  // ===== 计算属性（改为方法，避免无限循环） =====
  getCurrentSession: () => Session | null;
  getCurrentTopic: () => Topic | VirtualTopic | null;
  getDisplayMode: () => 'paged' | 'continuous';
  getAllTopicsForSession: (sessionId?: string | null) => (Topic | VirtualTopic)[];

  // ===== Actions =====
  // 会话
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  createSession: (data: Omit<MessageCreate, 'session_id' | 'topic_id'> & { session_type: string }) => Promise<Session>;
  updateSession: (sessionId: string, data: Partial<Session>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;

  // 话题
  loadTopics: (sessionId: string) => Promise<void>;
  selectTopic: (topicId: string) => Promise<void>;
  createTopic: (sessionId: string, name?: string) => Promise<Topic>;
  updateTopic: (topicId: string, data: Partial<Topic>) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  navigateTopic: (direction: 'prev' | 'next') => Promise<void>;

  // 消息
  loadMessages: (sessionId: string, topicId?: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  sendIMMessage: (content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  // AI 对话
  sendAIMessage: (content: string) => Promise<void>;
  recoverActiveStream: () => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  clearStreamState: () => void;
  sendResumeDecisions: (decisions: Array<{ type: string; edited_action?: { name: string; args: Record<string, unknown> } }>) => Promise<void>;

  // Sandbox
  loadSandboxStatus: (sessionId: string) => Promise<void>;
  createSandbox: (
    sessionId: string,
    options?: {
      image?: string;
      timeout?: number | null;
      env?: Record<string, string>;
      mounts?: SandboxMount[];
    },
  ) => Promise<void>;
  pauseSandbox: (sessionId: string) => Promise<void>;
  resumeSandbox: (sessionId: string) => Promise<void>;
  stopSandbox: (sessionId: string) => Promise<void>;
  updateSandboxConfig: (
    sessionId: string,
    data: {
      image?: string;
      timeout?: number | null;
      env?: Record<string, string>;
      mounts?: SandboxMount[];
    },
  ) => Promise<void>;

  // UI
  setTopicSidebarCollapsed: (collapsed: boolean) => void;
  setFileExplorerOpen: (open: boolean) => void;
  setSandboxPanelOpen: (open: boolean) => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  setBoundaryState: (progress: number, direction: 'up' | 'down' | null) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  setCurrentTopicId: (topicId: string | null) => void;
}

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
  topicSidebarCollapsed: typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  fileExplorerOpen: false,
  sandboxPanelOpen: false,
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  boundaryProgress: 0,
  boundaryDirection: null,

  // AI 对话初始状态
  isStreaming: false,
  streamingMessageId: null,
  isThinking: false,
  abortController: null,
  streamError: null,
  isRecoveringStream: false,
  pendingInterrupt: null,

  // Sandbox 初始状态
  sandboxStatus: {},
  sandboxLoading: {},

  // ===== 计算属性（改为方法，避免无限循环） =====
  getCurrentSession: () => {
    const { sessions, currentSessionId } = get();
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  },

  getCurrentTopic: () => {
    const { currentTopicId, currentSessionId, getAllTopicsForSession } = get();
    if (!currentTopicId || !currentSessionId) return null;
    return getAllTopicsForSession(currentSessionId).find((t) => t.id === currentTopicId) ?? null;
  },

  getDisplayMode: () => {
    const session = get().getCurrentSession();
    return session?.type === 'ai' ? 'paged' : 'continuous';
  },

  getAllTopicsForSession: (sessionId?: string | null) => {
    const { topics, virtualTopics, currentSessionId } = get();
    const id = sessionId ?? currentSessionId;
    if (!id) return [];
    return [
      ...(topics[id] ?? []),
      ...(virtualTopics[id] ?? []),
    ].sort(
      (a, b) =>
        // 按创建时间升序排序，最新的话题在列表底部
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  },

  // ===== 会话 Actions =====
  loadSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const response = await sessionApi.getSessions({ page: 1, size: 100 });
      set({ sessions: response.items });
    } catch (error) {
      console.error('loadSessions error', error);
      set({ sessionsError: '加载会话失败' });
    } finally {
      set({ sessionsLoading: false });
    }
  },

  selectSession: async (sessionId: string) => {
    const { topics, loadTopics, loadMessages, sessions } = get();

    set({
      currentSessionId: sessionId,
      currentTopicId: null,
    });

    // Auto-mark session as read (optimistic + fire-and-forget)
    const target = sessions.find((s) => s.id === sessionId);
    if (target && target.unread_count > 0) {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, unread_count: 0 } : s,
        ),
      }));
      sessionApi.markSessionRead(sessionId).catch(() => {});
    }

    if (!topics[sessionId]) {
      await loadTopics(sessionId);
    }

    const session = get().sessions.find((s) => s.id === sessionId);
    if (session?.type === 'ai') {
      const sessionTopics = get().getAllTopicsForSession(sessionId).filter((t) => !(t as VirtualTopic).is_virtual);
      if (sessionTopics.length > 0) {
        // 选择最后一个话题（最新的话题在列表底部）
        const latestTopic = sessionTopics[sessionTopics.length - 1];
        set({ currentTopicId: latestTopic.id });
        await loadMessages(sessionId, latestTopic.id);
        await get().recoverActiveStream();
      }
    } else {
      await loadMessages(sessionId);
    }
  },

  createSession: async (data) => {
    // 这里仅使用后端已有的 SessionCreate 字段，忽略 MessageCreate 中的多余字段
    const { session_type, ...rest } = data as any;
    const session = await sessionApi.createSession({
      type: session_type,
      metadata: rest.metadata,
      agent_id: rest.agent_id,
      name: rest.name,
      source: rest.source,
    });
    set((state) => ({ sessions: [session, ...state.sessions] }));
    return session;
  },

  updateSession: async (sessionId, data) => {
    await sessionApi.updateSession(sessionId, {
      name: data.name,
      type: data.type,
      agent_id: data.agent_id,
      metadata: data.metadata,
      source: data.source,
      last_visited_at: data.last_visited_at,
      auto_reply_enabled: data.auto_reply_enabled,
    });
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, ...data } : s,
      ),
    }));
  },

  deleteSession: async (sessionId) => {
    await sessionApi.deleteSession(sessionId);
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      currentSessionId:
        state.currentSessionId === sessionId ? null : state.currentSessionId,
    }));
  },

  // ===== 话题 Actions =====
  loadTopics: async (sessionId: string) => {
    set((state) => ({
      topicsLoading: { ...state.topicsLoading, [sessionId]: true },
    }));
    try {
      const topicList = await sessionApi.getTopics(sessionId);
      set((state) => ({
        topics: { ...state.topics, [sessionId]: topicList },
      }));

      // 拉取所有消息用于虚拟话题计算与连续模式
      const allMessages = await sessionApi.getMessages(sessionId, {
        size: 200,
      });
      const orphanMessages = allMessages.items.filter((m) => !m.topic_id);
      const virtualTopicList = computeVirtualTopics(orphanMessages, sessionId);

      set((state) => ({
        virtualTopics: {
          ...state.virtualTopics,
          [sessionId]: virtualTopicList,
        },
        sessionMessages: {
          ...state.sessionMessages,
          [sessionId]: allMessages.items,
        },
      }));
    } catch (error) {
      console.error('loadTopics error', error);
    } finally {
      set((state) => ({
        topicsLoading: { ...state.topicsLoading, [sessionId]: false },
      }));
    }
  },

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
        const { getVirtualTopicMessages } = await import('@/lib/virtualTopic');
        const virtualMsgs = getVirtualTopicMessages(vt, allMsgs);
        set(state => ({
          messages: { ...state.messages, [topicId]: virtualMsgs }
        }));
      }
    } else {
      // 真实话题：从 API 加载
      await loadMessages(currentSessionId, topicId);
      await get().recoverActiveStream();
    }
  },

  navigateTopic: async (direction: 'prev' | 'next') => {
    const { currentTopicId, currentSessionId, getAllTopicsForSession, selectTopic } = get();
    if (!currentSessionId) return;

    const topics = getAllTopicsForSession(currentSessionId);
    if (topics.length === 0) return;

    const currentIndex = topics.findIndex((t) => t.id === currentTopicId);

    // 话题按 created_at 升序排列（最旧在 index 0，最新在末尾）
    // prev = 向上滚动 = 查看更旧的话题 = index - 1
    // next = 向下滚动 = 查看更新的话题 = index + 1
    if (direction === 'prev' && currentIndex > 0) {
      await selectTopic(topics[currentIndex - 1].id);
    } else if (direction === 'next') {
      if (currentIndex >= 0 && currentIndex < topics.length - 1) {
        await selectTopic(topics[currentIndex + 1].id);
      } else {
        // 已经是最新的话题，准备新建（实际在 sendMessage 中完成）
        const session = get().getCurrentSession();
        if (session?.type === 'ai') {
          // 这里只是占位逻辑，不直接新建
          console.info('到达最新话题，等待用户输入创建新话题');
        }
      }
    }
  },

  createTopic: async (sessionId, name) => {
    const topic = await sessionApi.createTopic(sessionId, {
      name,
      session_id: sessionId,
    });
    set((state) => ({
      topics: {
        ...state.topics,
        [sessionId]: [...(state.topics[sessionId] ?? []), topic],
      },
    }));
    return topic;
  },

  updateTopic: async (topicId, data) => {
    const topicEntry = Object.entries(get().topics).find(([_, list]) =>
      list.some((t) => t.id === topicId),
    );
    const sessionId = topicEntry?.[0];
    if (!sessionId) return;

    await sessionApi.updateTopic(topicId, {
      name: data.name,
    });

    set((state) => ({
      topics: {
        ...state.topics,
        [sessionId]: state.topics[sessionId].map((t) =>
          t.id === topicId ? { ...t, ...data } : t,
        ),
      },
    }));
  },

  deleteTopic: async (topicId) => {
    await sessionApi.deleteTopic(topicId);
    const entry = Object.entries(get().topics).find(([_, list]) =>
      list.some((t) => t.id === topicId),
    );
    const sessionId = entry?.[0];
    if (!sessionId) return;

    set((state) => ({
      topics: {
        ...state.topics,
        [sessionId]: state.topics[sessionId].filter((t) => t.id !== topicId),
      },
      currentTopicId:
        state.currentTopicId === topicId ? null : state.currentTopicId,
    }));
  },

  // ===== 消息 Actions =====
  loadMessages: async (sessionId: string, topicId?: string) => {
    const key = topicId ?? sessionId;
    set((state) => ({
      messagesLoading: { ...state.messagesLoading, [key]: true },
    }));
    try {
      const params = topicId
        ? { topic_id: topicId, size: 100 }
        : { size: 200 };
      const response = await sessionApi.getMessages(sessionId, params);
      console.debug('[loadMessages] API returned', response.items.length, 'messages', response.items.map((m: any) => ({ id: m.id, role: m.role, parts: m.parts?.length ?? 0, partsTypes: m.parts?.map((p: any) => p.type) })));
      if (topicId) {
        set((state) => ({
          messages: { ...state.messages, [topicId]: response.items },
        }));
      } else {
        set((state) => ({
          sessionMessages: {
            ...state.sessionMessages,
            [sessionId]: response.items,
          },
        }));
      }
    } catch (error) {
      console.error('loadMessages error', error);
    } finally {
      set((state) => ({
        messagesLoading: { ...state.messagesLoading, [key]: false },
      }));
    }
  },

  sendMessage: async (content: string) => {
    const {
      currentSessionId,
      currentTopicId,
      createTopic,
      loadMessages,
      getCurrentSession,
    } = get();
    if (!currentSessionId) return;

    const session = getCurrentSession();
    if (!session) return;

    // 判断是否是 IM 类型的 session（pm/group）且配置为自动发送
    const isIMSession = session.type === 'pm' || session.type === 'group';
    const autoSendIM = session.metadata?.auto_send_im !== false; // 默认 true

    if (isIMSession && autoSendIM) {
      // 使用 IM 发送接口
      await get().sendIMMessage(content);
      return;
    }

    // 原有逻辑：普通消息发送
    let topicId = currentTopicId ?? undefined;

    const mode = get().getDisplayMode();
    if (mode === 'paged' && !topicId) {
      const name =
        content.length > 30 ? `${content.slice(0, 30)}...` : content;
      const newTopic = await createTopic(currentSessionId, name);
      topicId = newTopic.id;
      set({ currentTopicId: topicId });
    }

    await sessionApi.createMessage(currentSessionId, {
      session_id: currentSessionId,
      topic_id: topicId,
      role: 'user',
      parts: [
        {
          type: 'text',
          content,
        },
      ],
    });

    await loadMessages(currentSessionId, topicId);
  },

  sendIMMessage: async (content: string) => {
    const { currentSessionId, loadMessages } = get();
    if (!currentSessionId) return;

    try {
      // 调用 IM Gateway 发送接口
      const result = await sessionApi.sendIMMessage(currentSessionId, {
        message: [{ type: 'text', text: content }],
        message_str: content,
      });

      if (!result.success) {
        console.error('IM message send failed:', result.error);
        // 可以在这里添加错误提示
      }

      // 刷新消息列表
      await loadMessages(currentSessionId);
    } catch (error) {
      console.error('sendIMMessage error:', error);
      // 可以在这里添加错误提示
    }
  },

  deleteMessage: async (messageId: string) => {
    await sessionApi.deleteMessage(messageId);
    // 简单做法：重新加载当前会话/话题消息
    const { currentSessionId, currentTopicId, loadMessages } = get();
    if (!currentSessionId) return;
    await loadMessages(currentSessionId, currentTopicId ?? undefined);
  },

  // ===== Sandbox Actions =====
  loadSandboxStatus: async (sessionId: string) => {
    set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: true } }));
    try {
      const info = await sandboxApi.getStatus(sessionId);
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: info },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    } catch {
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: null },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    }
  },

  createSandbox: async (
    sessionId: string,
    options?: {
      image?: string;
      timeout?: number | null;
      mounts?: SandboxMount[];
    },
  ) => {
    set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: true } }));
    try {
      const info = await sandboxApi.create(sessionId, options);
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: info },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    } catch (err: any) {
      set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: false } }));
      throw err;
    }
  },

  pauseSandbox: async (sessionId: string) => {
    set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: true } }));
    try {
      const info = await sandboxApi.pause(sessionId);
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: info },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    } catch (err: any) {
      set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: false } }));
      throw err;
    }
  },

  resumeSandbox: async (sessionId: string) => {
    set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: true } }));
    try {
      const info = await sandboxApi.resume(sessionId);
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: info },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    } catch (err: any) {
      set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: false } }));
      throw err;
    }
  },

  stopSandbox: async (sessionId: string) => {
    set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: true } }));
    try {
      const info = await sandboxApi.stop(sessionId);
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: info },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    } catch (err: any) {
      set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: false } }));
      throw err;
    }
  },

  updateSandboxConfig: async (sessionId, data) => {
    set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: true } }));
    try {
      const info = await sandboxApi.updateConfig(sessionId, data);
      set((s) => ({
        sandboxStatus: { ...s.sandboxStatus, [sessionId]: info },
        sandboxLoading: { ...s.sandboxLoading, [sessionId]: false },
      }));
    } catch (err: any) {
      set((s) => ({ sandboxLoading: { ...s.sandboxLoading, [sessionId]: false } }));
      throw err;
    }
  },

  // ===== UI Actions =====
  setTopicSidebarCollapsed: (collapsed) => set({ topicSidebarCollapsed: collapsed }),
  setFileExplorerOpen: (open) => set({ fileExplorerOpen: open, ...(open ? { sandboxPanelOpen: false } : {}) }),
  setSandboxPanelOpen: (open) => set({ sandboxPanelOpen: open, ...(open ? { fileExplorerOpen: false } : {}) }),
  setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
  setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
  setBoundaryState: (progress, direction) => set({ boundaryProgress: progress, boundaryDirection: direction }),
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  setCurrentTopicId: (topicId) => set({ currentTopicId: topicId }),

  // ===== AI 对话 Actions =====
  sendAIMessage: async (content: string) => {
    const { currentSessionId, currentTopicId, sessions, isRecoveringStream } = get();

    if (!currentSessionId) {
      set({ streamError: 'No session selected' });
      return;
    }

    const session = sessions.find((s) => s.id === currentSessionId);
    if (!session || session.type !== 'ai') {
      set({ streamError: 'Not an AI session' });
      return;
    }

    if (isRecoveringStream) {
      const recoveringController = get().abortController;
      recoveringController?.abort();
      clearStreamSnapshot();
      set({ isRecoveringStream: false });
    }

    const controller = new AbortController();
    const userMessageId = `temp-user-${Date.now()}`;
    const aiMessageId = `temp-ai-${Date.now()}`;

    let topicId = currentTopicId;
    if (!topicId) {
      const topicName = content.length > 30 ? `${content.slice(0, 30)}...` : content;
      const newTopic = await get().createTopic(currentSessionId, topicName);
      topicId = newTopic.id;
      set({ currentTopicId: topicId });
    }

    const topicKey = topicId || currentSessionId;

    const userMessage: Message = {
      id: userMessageId,
      session_id: currentSessionId,
      topic_id: topicId || undefined,
      role: 'user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      parts: [{ id: `${userMessageId}-part`, message_id: userMessageId, type: 'text', content, created_at: new Date().toISOString() }],
    };

    let aiMessage: Message = {
      id: aiMessageId,
      session_id: currentSessionId,
      topic_id: topicId || undefined,
      role: 'assistant',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      parts: [],
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [topicKey]: [...(state.messages[topicKey] || []), userMessage, aiMessage],
      },
      isStreaming: true,
      streamingMessageId: aiMessageId,
      isThinking: false,
      abortController: controller,
      streamError: null,
      isRecoveringStream: false,
    }));

    writeStreamSnapshot({
      sessionId: currentSessionId,
      topicId: topicId as string,
      assistantTempMessageId: aiMessageId,
      lastEventId: 0,
      startedAt: new Date().toISOString(),
      status: 'streaming',
    });

    let lastEventId = 0;
    let receivedDone = false;
    let wasAborted = false;

    // Reconnection with exponential backoff
    const attemptReconnect = async (): Promise<boolean> => {
      if (!topicId) return false;

      const MAX_RETRIES = 3;
      const BASE_DELAY_MS = 1000;
      const MAX_DELAY_MS = 30000;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (controller.signal.aborted) return false;

        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        console.info(`[reconnect] Attempt ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (lastEventId=${lastEventId})`);
        await new Promise((r) => setTimeout(r, delay));

        if (controller.signal.aborted) return false;

        try {
          // Check stream status first
          const status = await getStreamStatus(currentSessionId, topicId);
          console.info('[reconnect] Stream status:', status.status);

          if (status.status === 'none') {
            // Session expired — fall back to DB
            if (topicId) await get().loadMessages(currentSessionId, topicId);
            clearStreamSnapshot();
            return true; // Handled
          }

          if (status.status === 'streaming' || status.status === 'completed') {
            // Reconnect and replay missed events
            const stream = reconnectStream(
              currentSessionId,
              topicId,
              lastEventId,
              { signal: controller.signal },
            );
            const consumed = await consumeStreamEvents({
              eventSource: stream,
              initialMessage: aiMessage,
              initialState: createInitialState(),
              aiMessageId,
              topicKey,
              topicId,
              sessionId: currentSessionId,
              set,
              get,
              onSnapshotEventId: (eventId) => {
                lastEventId = eventId;
                const snapshot = readStreamSnapshot();
                if (snapshot) {
                  writeStreamSnapshot({ ...snapshot, lastEventId: eventId, status: 'streaming' });
                }
              },
            });
            receivedDone = consumed.receivedDone;
            return true; // Successfully reconnected
          }

          // error/cancelled — just load from DB
          if (topicId) await get().loadMessages(currentSessionId, topicId);
          return true;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return false;
          console.warn(`[reconnect] Attempt ${attempt + 1} failed:`, err);
        }
      }

      // All retries exhausted — fall back to DB
      console.warn('[reconnect] All retries exhausted, falling back to DB');
      if (topicId) {
        try { await get().loadMessages(currentSessionId, topicId); } catch { /* ignore */ }
      }
      return true;
    };

    try {
      const consumed = await consumeStreamEvents({
        eventSource: chatWithAgentStream(currentSessionId, content, {
          topicId: topicId || undefined,
          signal: controller.signal,
        }),
        initialMessage: aiMessage,
        initialState: createInitialState(),
        aiMessageId,
        topicKey,
        topicId,
        sessionId: currentSessionId,
        set,
        get,
        onSnapshotEventId: (eventId) => {
          lastEventId = eventId;
          const snapshot = readStreamSnapshot();
          if (snapshot) {
            writeStreamSnapshot({ ...snapshot, lastEventId: eventId, status: 'streaming' });
          }
        },
      });
      receivedDone = consumed.receivedDone;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        wasAborted = true;
        receivedDone = true;
        set({ isStreaming: false, abortController: null, streamingMessageId: null });
      } else if (!receivedDone) {
        // Connection error — attempt reconnect
        console.warn('[sendAIMessage] Stream disconnected, attempting reconnect...', (error as Error).message);
        const handled = await attemptReconnect();
        if (handled) {
          receivedDone = true;
        } else {
          set({
            isStreaming: false,
            streamError: (error as Error).message,
            abortController: null,
            streamingMessageId: null,
          });
          receivedDone = true;
        }
      }
    } finally {
      if (!receivedDone && !wasAborted) {
        // Stream ended without done event and wasn't aborted — try reconnect
        console.warn('[sendAIMessage] Stream ended without done event, attempting reconnect');
        const handled = await attemptReconnect();
        if (!handled) {
          set({ isStreaming: false, streamingMessageId: null, abortController: null });
          if (topicId) {
            try { await get().loadMessages(currentSessionId, topicId); } catch { /* ignore */ }
          }
        }
      }
    }
  },

  recoverActiveStream: async () => {
    const snapshot = readStreamSnapshot();
    const { currentSessionId, currentTopicId, isStreaming, isRecoveringStream } = get();
    if (!snapshot || !currentSessionId || !currentTopicId) return;
    if (isStreaming || isRecoveringStream) return;
    if (snapshot.sessionId !== currentSessionId || snapshot.topicId !== currentTopicId) return;

    const topicKey = currentTopicId;
    const controller = new AbortController();
    const aiMessageId = snapshot.assistantTempMessageId || `streaming:${currentSessionId}:${currentTopicId}`;

    const existing = (get().messages[topicKey] || []).find((m) => m.id === aiMessageId);
    const baseMessage: Message = existing || {
      id: aiMessageId,
      session_id: currentSessionId,
      topic_id: currentTopicId,
      role: 'assistant',
      created_at: snapshot.startedAt,
      updated_at: new Date().toISOString(),
      is_deleted: false,
      parts: [],
    };

    if (!existing) {
      set((state) => ({
        messages: {
          ...state.messages,
          [topicKey]: [...(state.messages[topicKey] || []), baseMessage],
        },
      }));
    }

    set({
      isStreaming: true,
      isRecoveringStream: true,
      streamingMessageId: aiMessageId,
      abortController: controller,
      streamError: null,
    });

    try {
      const status = await getStreamStatus(currentSessionId, currentTopicId);
      if (status.status === 'none' || status.status === 'error' || status.status === 'cancelled') {
        clearStreamSnapshot();
        set({ isStreaming: false, isRecoveringStream: false, streamingMessageId: null, abortController: null });
        await get().loadMessages(currentSessionId, currentTopicId);
        return;
      }

      const stream = reconnectStream(
        currentSessionId,
        currentTopicId,
        // If we cannot find the previous temp message in memory (e.g. after refresh),
        // replay from 0 to rebuild full assistant content.
        existing ? (snapshot.lastEventId || 0) : 0,
        { signal: controller.signal },
      );
      await consumeStreamEvents({
        eventSource: stream,
        initialMessage: baseMessage,
        initialState: createInitialState(),
        aiMessageId,
        topicKey,
        topicId: currentTopicId,
        sessionId: currentSessionId,
        set,
        get,
        onSnapshotEventId: (eventId) => {
          const prev = readStreamSnapshot();
          if (prev) writeStreamSnapshot({ ...prev, lastEventId: eventId, status: 'streaming' });
        },
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ streamError: (error as Error).message });
      }
      set({ isStreaming: false, isRecoveringStream: false, streamingMessageId: null, abortController: null });
      await get().loadMessages(currentSessionId, currentTopicId);
      clearStreamSnapshot();
    }
  },

  stopGeneration: () => {
    const { abortController, currentSessionId, currentTopicId } = get();

    if (abortController) {
      abortController.abort();
    }

    if (currentSessionId && currentTopicId) {
      apiStopGeneration(currentSessionId, currentTopicId).catch(() => {
        // Ignore errors
      });
    }

    clearStreamSnapshot();
    set({ isStreaming: false, abortController: null, isRecoveringStream: false });
  },

  regenerateMessage: async (messageId: string) => {
    const { messages, currentSessionId, currentTopicId } = get();

    // 找到消息
    const topicKey = currentTopicId || currentSessionId;
    if (!topicKey) return;

    const currentMessages = messages[topicKey] || [];
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];
    if (message.role !== 'assistant') return;

    // 找到对应的用户消息
    const userMessage = currentMessages
      .slice(0, messageIndex)
      .reverse()
      .find((m) => m.role === 'user');

    if (!userMessage) return;

    // 删除 AI 消息
    set((state) => {
      const updatedMessages = (state.messages[topicKey] || []).filter(
        (m) => m.id !== messageId
      );
      return {
        messages: {
          ...state.messages,
          [topicKey]: updatedMessages,
        },
      };
    });

    // 获取用户消息内容
    const userContent = userMessage.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('');

    // 重新发送
    await get().sendAIMessage(userContent);
  },

  clearStreamState: () => {
    clearStreamSnapshot();
    set({
      isStreaming: false,
      streamingMessageId: null,
      isThinking: false,
      abortController: null,
      streamError: null,
      pendingInterrupt: null,
      isRecoveringStream: false,
    });
  },

  sendResumeDecisions: async (decisions) => {
    const { currentSessionId, currentTopicId } = get();
    if (!currentSessionId || !currentTopicId) {
      set({ streamError: 'No session or topic', pendingInterrupt: null });
      return;
    }

    set({ pendingInterrupt: null, isStreaming: true });

    const controller = new AbortController();
    const aiMessageId = get().streamingMessageId || `temp-ai-${Date.now()}`;
    const topicKey = currentTopicId || currentSessionId;
    set({ streamingMessageId: aiMessageId, abortController: controller });

    // Build a temporary message to process events against
    let currentMsg: Message = {
      id: aiMessageId,
      session_id: currentSessionId,
      topic_id: currentTopicId || undefined,
      role: 'assistant',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      parts: [],
    };

    const updateMsg = (msg: Message) => {
      set((state) => {
        const msgs = state.messages[topicKey] || [];
        const idx = msgs.findIndex((m) => m.id === aiMessageId);
        if (idx === -1) {
          // Append as new message
          return { messages: { ...state.messages, [topicKey]: [...msgs, msg] } };
        }
        const updated = [...msgs];
        updated[idx] = msg;
        return { messages: { ...state.messages, [topicKey]: updated } };
      });
    };

    let receivedDone = false;

    try {
      let proc = createInitialState();

      for await (const event of chatResumeStream(
        currentSessionId,
        currentTopicId,
        decisions,
        { signal: controller.signal }
      )) {
        const result = processStreamEvent(currentMsg, event, proc);
        currentMsg = result.message;
        proc = result.state;
        updateMsg(currentMsg);

        if (result.effects.isThinking !== undefined) {
          set({ isThinking: result.effects.isThinking });
        }
        if (result.effects.interrupt) {
          receivedDone = true;
          set({ pendingInterrupt: result.effects.interrupt, isStreaming: false, abortController: null });
        }
        if (result.effects.error) {
          set({ streamError: result.effects.error });
        }
        if (result.effects.done) {
          receivedDone = true;
          set({ isStreaming: false, streamingMessageId: null, abortController: null });
          await get().loadMessages(currentSessionId, currentTopicId);
        }
      }
    } catch (err) {
      receivedDone = true;
      if ((err as Error).name !== 'AbortError') {
        set({
          isStreaming: false,
          streamError: (err as Error).message,
          abortController: null,
          pendingInterrupt: null,
        });
      }
    } finally {
      if (!receivedDone) {
        console.warn('[sendResumeDecisions] Stream ended without done event, cleaning up');
        set({
          isStreaming: false,
          streamingMessageId: null,
          abortController: null,
        });
        try {
          await get().loadMessages(currentSessionId, currentTopicId);
        } catch { /* ignore */ }
      }
    }
  },
}));
