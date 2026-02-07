import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { useChatStore } from '@/store/chat';
import { cn } from '@/lib/utils';
import { SessionSidebar } from './SessionSidebar';
import { MessageArea } from './MessageArea';
import { TopicSidebar } from './TopicSidebar';
import { ResizableHandle } from '@/components/ui/resizable';

interface ChatLayoutProps {
  className?: string;
  initialSessionId?: string;
  initialTopicId?: string;
}

const SESSION_SIDEBAR_MIN_WIDTH = 240;
const SESSION_SIDEBAR_MAX_WIDTH = 400;
const SESSION_SIDEBAR_DEFAULT_WIDTH = 320;

export function ChatLayout({ className, initialSessionId, initialTopicId }: ChatLayoutProps) {
  const navigate = useNavigate();
  const { isDesktop, isTablet, isMobile } = useBreakpoints();
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);
  const rightDrawerOpen = useChatStore((state) => state.rightDrawerOpen);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const currentTopicId = useChatStore((state) => state.currentTopicId);
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);
  const setCurrentTopicId = useChatStore((state) => state.setCurrentTopicId);

  // 可调整的侧边栏宽度
  const [sessionSidebarWidth, setSessionSidebarWidth] = useState(SESSION_SIDEBAR_DEFAULT_WIDTH);

  // 移动端视图状态：'sessions' | 'messages'
  const [mobileView, setMobileView] = useState<'sessions' | 'messages'>('sessions');

  // 使用 ref 防止循环更新
  const isInitialMount = useRef(true);
  const lastSyncedSession = useRef<string | null>(null);
  const lastSyncedTopic = useRef<string | null>(null);

  // 初始化：从 URL 参数设置当前 session 和 topic（仅首次挂载）
  useEffect(() => {
    if (!isInitialMount.current) return;
    
    if (initialSessionId && initialSessionId !== currentSessionId) {
      setCurrentSessionId(initialSessionId);
      lastSyncedSession.current = initialSessionId;
      if (isMobile) {
        setMobileView('messages');
      }
    }
    if (initialTopicId && initialTopicId !== currentTopicId) {
      setCurrentTopicId(initialTopicId);
      lastSyncedTopic.current = initialTopicId;
    }
    
    isInitialMount.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空依赖数组，仅在挂载时运行一次

  // 监听 store 中的 session/topic 变化，更新 URL
  useEffect(() => {
    // 跳过初始挂载时的同步
    if (isInitialMount.current) return;
    
    // 检查是否真的需要更新 URL（避免重复 navigate）
    if (
      lastSyncedSession.current === currentSessionId &&
      lastSyncedTopic.current === currentTopicId
    ) {
      return;
    }
    
    // 更新 URL
    if (currentSessionId) {
      if (currentTopicId) {
        navigate(`/sessions/${currentSessionId}/topics/${currentTopicId}`, { replace: true });
      } else {
        navigate(`/sessions/${currentSessionId}`, { replace: true });
      }
    } else {
      navigate('/sessions', { replace: true });
    }
    
    // 记录已同步的值
    lastSyncedSession.current = currentSessionId;
    lastSyncedTopic.current = currentTopicId;
  }, [currentSessionId, currentTopicId, navigate]);

  const handleSessionSidebarResize = useCallback((delta: number) => {
    setSessionSidebarWidth((prev) =>
      Math.min(SESSION_SIDEBAR_MAX_WIDTH, Math.max(SESSION_SIDEBAR_MIN_WIDTH, prev + delta))
    );
  }, []);

  // 移动端：选择会话后进入消息视图
  const handleSessionSelect = useCallback(() => {
    if (isMobile) {
      setMobileView('messages');
    }
  }, [isMobile]);

  // 移动端：返回会话列表
  const handleBackToSessions = useCallback(() => {
    setMobileView('sessions');
  }, []);

  // 移动端布局：会话列表和消息区域切换显示
  if (isMobile) {
    return (
      <div className={cn('flex h-full', className)}>
        {mobileView === 'sessions' ? (
          <div className="flex-1 border rounded-lg bg-background">
            <SessionSidebar onSessionSelect={handleSessionSelect} />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <MessageArea onBack={handleBackToSessions} showBackButton />
          </div>
        )}

        {/* 移动端：右侧抽屉 - 话题列表 */}
        <>
          {/* 遮罩层 */}
          <div
            className={cn(
              'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
              rightDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={() => setRightDrawerOpen(false)}
          />
          {/* 抽屉 */}
          <div
            className={cn(
              'fixed inset-y-0 right-0 z-50 w-72 max-w-[80vw] border-l bg-background transition-transform duration-300 ease-in-out',
              rightDrawerOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <TopicSidebar />
          </div>
        </>
      </div>
    );
  }

  // 平板布局：隐藏话题侧边栏，使用抽屉
  if (isTablet && !isDesktop) {
    return (
      <div className={cn('flex h-full', className)}>
        {/* 左侧：会话列表 - 可调整宽度 */}
        <div
          className="shrink-0 border rounded-lg bg-background overflow-hidden"
          style={{ width: sessionSidebarWidth }}
        >
          <SessionSidebar />
        </div>

        {/* 拖拽手柄 */}
        <ResizableHandle
          direction="horizontal"
          onResize={handleSessionSidebarResize}
        />

        {/* 中间：消息区域 */}
        <div className="flex-1 min-w-0">
          <MessageArea />
        </div>

        {/* 平板端：右侧抽屉 - 话题列表 */}
        <>
          {/* 遮罩层 */}
          <div
            className={cn(
              'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
              rightDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
            onClick={() => setRightDrawerOpen(false)}
          />
          {/* 抽屉 */}
          <div
            className={cn(
              'fixed inset-y-0 right-0 z-50 w-72 max-w-[80vw] border-l bg-background transition-transform duration-300 ease-in-out',
              rightDrawerOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <TopicSidebar />
          </div>
        </>
      </div>
    );
  }

  // 桌面布局：两栏（会话列表 + 消息区域，话题列表在消息区域内）
  return (
    <div className={cn('flex h-full', className)}>
      {/* 左侧：会话列表 - 可调整宽度 */}
      <div
        className="shrink-0 overflow-hidden border rounded-lg bg-background"
        style={{ width: sessionSidebarWidth }}
      >
        <SessionSidebar />
      </div>

      {/* 左侧拖拽手柄 */}
      <ResizableHandle
        direction="horizontal"
        onResize={handleSessionSidebarResize}
      />

      {/* 右侧：消息区域（内含话题列表） */}
      <div className="flex-1 min-w-0">
        <MessageArea />
      </div>
    </div>
  );
}

