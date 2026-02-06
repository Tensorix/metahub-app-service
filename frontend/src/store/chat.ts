import { create } from 'zustand';
import { sessionApi, type Session, type Topic, type Message, type MessageCreate } from '@/lib/api';
import { computeVirtualTopics, type VirtualTopic } from '@/lib/virtualTopic';
import { chatWithAgentStream, stopGeneration as apiStopGeneration } from '@/lib/agentApi';

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
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  boundaryProgress: number; // 0-100
  boundaryDirection: 'up' | 'down' | null;

  // ===== AI 对话状态 =====
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  streamingThinking: string;
  isThinking: boolean;
  abortController: AbortController | null;
  activeToolCall: {
    call_id: string;
    name: string;
    args: Record<string, unknown>;
  } | null;
  pendingParts: Array<{
    type: 'thinking' | 'tool_call' | 'tool_result' | 'error';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  streamError: string | null;

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
  stopGeneration: () => void;
  regenerateMessage: (messageId: string) => Promise<void>;
  clearStreamState: () => void;

  // UI
  setTopicSidebarCollapsed: (collapsed: boolean) => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  setBoundaryState: (progress: number, direction: 'up' | 'down' | null) => void;
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
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  boundaryProgress: 0,
  boundaryDirection: null,

  // AI 对话初始状态
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: '',
  streamingThinking: '',
  isThinking: false,
  abortController: null,
  activeToolCall: null,
  pendingParts: [],
  streamError: null,

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
    const { topics, loadTopics, loadMessages } = get();

    set({
      currentSessionId: sessionId,
      currentTopicId: null,
    });

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

  // ===== UI Actions =====
  setTopicSidebarCollapsed: (collapsed) => set({ topicSidebarCollapsed: collapsed }),
  setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
  setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
  setBoundaryState: (progress, direction) => set({ boundaryProgress: progress, boundaryDirection: direction }),

  // ===== AI 对话 Actions =====
  sendAIMessage: async (content: string) => {
    const { currentSessionId, currentTopicId, sessions } = get();

    if (!currentSessionId) {
      set({ streamError: 'No session selected' });
      return;
    }

    // 检查是否是 AI session
    const session = sessions.find((s) => s.id === currentSessionId);
    if (!session || session.type !== 'ai') {
      set({ streamError: 'Not an AI session' });
      return;
    }

    // 创建 AbortController
    const controller = new AbortController();

    // 生成临时消息 ID
    const userMessageId = `temp-user-${Date.now()}`;
    const aiMessageId = `temp-ai-${Date.now()}`;

    // 获取或创建 topic
    let topicId = currentTopicId;
    if (!topicId) {
      const topicName = content.length > 30 ? `${content.slice(0, 30)}...` : content;
      const newTopic = await get().createTopic(currentSessionId, topicName);
      topicId = newTopic.id;
      set({ currentTopicId: topicId });
    }

    // 添加用户消息到 UI
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

    // 添加空的 AI 消息占位（支持多 Part）
    const aiMessage: Message = {
      id: aiMessageId,
      session_id: currentSessionId,
      topic_id: topicId || undefined,
      role: 'assistant',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      parts: [],  // 初始为空，动态添加
    };

    set((state) => {
      const topicKey = topicId || currentSessionId;
      const currentMessages = state.messages[topicKey] || [];
      return {
        messages: {
          ...state.messages,
          [topicKey]: [...currentMessages, userMessage, aiMessage],
        },
        isStreaming: true,
        streamingMessageId: aiMessageId,
        streamingContent: '',
        streamingThinking: '',
        isThinking: false,
        abortController: controller,
        streamError: null,
        activeToolCall: null,
        pendingParts: [],
      };
    });

    try {
      let currentCallId: string | null = null;
      let currentTextPartIndex = 0; // 跟踪当前是第几个 text part

      console.log('Starting AI chat stream:', { currentSessionId, content, topicId });

      for await (const event of chatWithAgentStream(
        currentSessionId,
        content,
        {
          topicId: topicId || undefined,
          signal: controller.signal,
        }
      )) {
        console.log('Received event:', event);
        
        // 处理不同事件类型
        switch (event.event) {
          case 'message':
            set((state) => {
              const newContent = state.streamingContent + (event.data.content || '');

              // 更新消息的 text part
              const topicKey = topicId || currentSessionId;
              const currentMessages = state.messages[topicKey] || [];
              const msgIndex = currentMessages.findIndex(
                (m) => m.id === state.streamingMessageId
              );

              if (msgIndex !== -1) {
                const updatedMessages = [...currentMessages];
                const message = { ...updatedMessages[msgIndex] };

                // 找到当前的 text part（使用 index 来区分多个 text part）
                const textPartId = `${message.id}-text-${currentTextPartIndex}`;
                let textPartIndex = message.parts.findIndex(p => p.id === textPartId);
                
                if (textPartIndex === -1) {
                  // 创建新的 text part
                  message.parts = [
                    ...message.parts,
                    {
                      id: textPartId,
                      message_id: message.id,
                      type: 'text',
                      content: newContent,
                      created_at: new Date().toISOString(),
                    }
                  ];
                } else {
                  // 更新现有 text part
                  message.parts = message.parts.map((p, i) =>
                    i === textPartIndex ? { ...p, content: newContent } : p
                  );
                }

                updatedMessages[msgIndex] = message;

                return {
                  streamingContent: newContent,
                  messages: {
                    ...state.messages,
                    [topicKey]: updatedMessages,
                  },
                };
              }
              return { streamingContent: newContent };
            });
            break;

          case 'thinking':
            set((state) => {
              const newThinking = state.streamingThinking + (event.data.content || '');

              // 更新消息的 thinking part
              const topicKey = topicId || currentSessionId;
              const currentMessages = state.messages[topicKey] || [];
              const msgIndex = currentMessages.findIndex(
                (m) => m.id === state.streamingMessageId
              );

              if (msgIndex !== -1) {
                const updatedMessages = [...currentMessages];
                const message = { ...updatedMessages[msgIndex] };

                // 找到或创建 thinking part
                let thinkingPartIndex = message.parts.findIndex(p => p.type === 'thinking');
                if (thinkingPartIndex === -1) {
                  message.parts = [
                    {
                      id: `${message.id}-thinking`,
                      message_id: message.id,
                      type: 'thinking',
                      content: newThinking,
                      created_at: new Date().toISOString(),
                    },
                    ...message.parts,
                  ];
                } else {
                  message.parts = message.parts.map((p, i) =>
                    i === thinkingPartIndex ? { ...p, content: newThinking } : p
                  );
                }

                updatedMessages[msgIndex] = message;

                return {
                  streamingThinking: newThinking,
                  isThinking: true,
                  messages: {
                    ...state.messages,
                    [topicKey]: updatedMessages,
                  },
                };
              }
              return { streamingThinking: newThinking, isThinking: true };
            });
            break;

          case 'tool_call':
            currentCallId = event.data.call_id || `call_${Date.now()}`;

            set((state) => {
              const toolCallPart = {
                type: 'tool_call' as const,
                content: JSON.stringify({
                  call_id: currentCallId,
                  name: event.data.name,
                  args: event.data.args,
                }),
                metadata: { timestamp: new Date().toISOString() },
              };

              // 更新消息 parts
              const topicKey = topicId || currentSessionId;
              const currentMessages = state.messages[topicKey] || [];
              const msgIndex = currentMessages.findIndex(
                (m) => m.id === state.streamingMessageId
              );

              if (msgIndex !== -1) {
                const updatedMessages = [...currentMessages];
                const message = { ...updatedMessages[msgIndex] };
                message.parts = [
                  ...message.parts,
                  {
                    id: `${message.id}-tc-${currentCallId}`,
                    message_id: message.id,
                    type: 'tool_call',
                    content: toolCallPart.content,
                    metadata: toolCallPart.metadata,
                    created_at: new Date().toISOString(),
                  }
                ];
                updatedMessages[msgIndex] = message;

                return {
                  activeToolCall: {
                    call_id: currentCallId!,
                    name: event.data.name || '',
                    args: event.data.args || {},
                  },
                  pendingParts: [...state.pendingParts, toolCallPart],
                  messages: {
                    ...state.messages,
                    [topicKey]: updatedMessages,
                  },
                };
              }

              return {
                activeToolCall: {
                  call_id: currentCallId!,
                  name: event.data.name || '',
                  args: event.data.args || {},
                },
                pendingParts: [...state.pendingParts, toolCallPart],
              };
            });
            
            // 重要：工具调用后，重置 streamingContent 并增加 text part index
            // 这样后续的 message 事件会创建新的 text part
            set({ streamingContent: '' });
            currentTextPartIndex++;
            break;

          case 'tool_result':
            set((state) => {
              const resultCallId = event.data.call_id || currentCallId;
              const toolResultPart = {
                type: 'tool_result' as const,
                content: JSON.stringify({
                  call_id: resultCallId,
                  name: event.data.name,
                  result: event.data.result,
                  success: event.data.success ?? true,
                }),
                metadata: { timestamp: new Date().toISOString() },
              };

              // 更新消息 parts
              const topicKey = topicId || currentSessionId;
              const currentMessages = state.messages[topicKey] || [];
              const msgIndex = currentMessages.findIndex(
                (m) => m.id === state.streamingMessageId
              );

              if (msgIndex !== -1) {
                const updatedMessages = [...currentMessages];
                const message = { ...updatedMessages[msgIndex] };
                message.parts = [
                  ...message.parts,
                  {
                    id: `${message.id}-tr-${resultCallId}`,
                    message_id: message.id,
                    type: 'tool_result',
                    content: toolResultPart.content,
                    metadata: toolResultPart.metadata,
                    created_at: new Date().toISOString(),
                  }
                ];
                updatedMessages[msgIndex] = message;

                return {
                  activeToolCall: null,
                  pendingParts: [...state.pendingParts, toolResultPart],
                  messages: {
                    ...state.messages,
                    [topicKey]: updatedMessages,
                  },
                };
              }

              return {
                activeToolCall: null,
                pendingParts: [...state.pendingParts, toolResultPart],
              };
            });
            currentCallId = null;
            break;

          case 'error':
            set((state) => {
              const errorPart = {
                type: 'error' as const,
                content: JSON.stringify({
                  error: event.data.error,
                  code: event.data.code,
                }),
                metadata: { timestamp: new Date().toISOString() },
              };

              // 更新消息 parts
              const topicKey = topicId || currentSessionId;
              const currentMessages = state.messages[topicKey] || [];
              const msgIndex = currentMessages.findIndex(
                (m) => m.id === state.streamingMessageId
              );

              if (msgIndex !== -1) {
                const updatedMessages = [...currentMessages];
                const message = { ...updatedMessages[msgIndex] };
                message.parts = [
                  ...message.parts,
                  {
                    id: `${message.id}-err-${Date.now()}`,
                    message_id: message.id,
                    type: 'error',
                    content: errorPart.content,
                    metadata: errorPart.metadata,
                    created_at: new Date().toISOString(),
                  }
                ];
                updatedMessages[msgIndex] = message;

                return {
                  streamError: event.data.error || 'Unknown error',
                  pendingParts: [...state.pendingParts, errorPart],
                  messages: {
                    ...state.messages,
                    [topicKey]: updatedMessages,
                  },
                };
              }

              return {
                streamError: event.data.error || 'Unknown error',
                pendingParts: [...state.pendingParts, errorPart],
              };
            });
            break;

          case 'done':
            // 流式完成
            set(() => ({
              isStreaming: false,
              streamingMessageId: null,
              abortController: null,
              activeToolCall: null,
              pendingParts: [],
            }));

            // 刷新消息列表获取真实 ID
            if (topicId) {
              await get().loadMessages(currentSessionId, topicId);
            }
            break;
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // 用户取消
        set((state) => {
          const topicKey = topicId || currentSessionId;
          const currentMessages = state.messages[topicKey] || [];
          const msgIndex = currentMessages.findIndex(
            (m) => m.id === state.streamingMessageId
          );

          if (msgIndex !== -1) {
            const updatedMessages = [...currentMessages];
            const message = { ...updatedMessages[msgIndex] };

            // 在 text part 后添加取消标记
            const textPartIndex = message.parts.findIndex(p => p.type === 'text');
            if (textPartIndex !== -1) {
              message.parts = message.parts.map((p, i) =>
                i === textPartIndex
                  ? { ...p, content: p.content + ' [已取消]' }
                  : p
              );
            }

            updatedMessages[msgIndex] = message;

            return {
              isStreaming: false,
              abortController: null,
              activeToolCall: null,
              streamingMessageId: null,
              pendingParts: [],
              messages: {
                ...state.messages,
                [topicKey]: updatedMessages,
              },
            };
          }

          return {
            isStreaming: false,
            abortController: null,
            activeToolCall: null,
            streamingMessageId: null,
            pendingParts: [],
          };
        });
      } else {
        set(() => ({
          isStreaming: false,
          streamError: (error as Error).message,
          abortController: null,
          activeToolCall: null,
          streamingMessageId: null,
          pendingParts: [],
        }));
      }
    }
  },

  stopGeneration: () => {
    const { abortController, currentSessionId, currentTopicId } = get();

    if (abortController) {
      abortController.abort();
    }

    // 也调用后端 API 确保停止
    if (currentSessionId && currentTopicId) {
      apiStopGeneration(currentSessionId, currentTopicId).catch(() => {
        // Ignore errors
      });
    }

    set(() => ({
      isStreaming: false,
      abortController: null,
      activeToolCall: null,
    }));
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
    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
      streamingThinking: '',
      isThinking: false,
      abortController: null,
      activeToolCall: null,
      pendingParts: [],
      streamError: null,
    });
  },
}));

