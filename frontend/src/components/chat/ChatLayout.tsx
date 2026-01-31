import { useState, useCallback } from 'react';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { useChatStore } from '@/store/chat';
import { cn } from '@/lib/utils';
import { SessionSidebar } from './SessionSidebar';
import { MessageArea } from './MessageArea';
import { TopicSidebar } from './TopicSidebar';
import { ResizableHandle } from '@/components/ui/resizable';

interface ChatLayoutProps {
  className?: string;
}

const SESSION_SIDEBAR_MIN_WIDTH = 240;
const SESSION_SIDEBAR_MAX_WIDTH = 400;
const SESSION_SIDEBAR_DEFAULT_WIDTH = 320;

const TOPIC_SIDEBAR_MIN_WIDTH = 200;
const TOPIC_SIDEBAR_MAX_WIDTH = 360;
const TOPIC_SIDEBAR_DEFAULT_WIDTH = 280;

export function ChatLayout({ className }: ChatLayoutProps) {
  const { isDesktop, isTablet, isMobile } = useBreakpoints();
  const topicSidebarCollapsed = useChatStore((state) => state.topicSidebarCollapsed);
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);
  const rightDrawerOpen = useChatStore((state) => state.rightDrawerOpen);

  // 可调整的侧边栏宽度
  const [sessionSidebarWidth, setSessionSidebarWidth] = useState(SESSION_SIDEBAR_DEFAULT_WIDTH);
  const [topicSidebarWidth, setTopicSidebarWidth] = useState(TOPIC_SIDEBAR_DEFAULT_WIDTH);

  // 移动端视图状态：'sessions' | 'messages'
  const [mobileView, setMobileView] = useState<'sessions' | 'messages'>('sessions');

  const handleSessionSidebarResize = useCallback((delta: number) => {
    setSessionSidebarWidth((prev) =>
      Math.min(SESSION_SIDEBAR_MAX_WIDTH, Math.max(SESSION_SIDEBAR_MIN_WIDTH, prev + delta))
    );
  }, []);

  const handleTopicSidebarResize = useCallback((delta: number) => {
    // 话题侧边栏在右侧，拖拽方向相反
    setTopicSidebarWidth((prev) =>
      Math.min(TOPIC_SIDEBAR_MAX_WIDTH, Math.max(TOPIC_SIDEBAR_MIN_WIDTH, prev - delta))
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

  // 桌面布局：三栏可调整
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

      {/* 中间：消息区域 */}
      <div className="flex-1 min-w-0">
        <MessageArea />
      </div>

      {/* 右侧：话题列表 (仅桌面端且未折叠) - 可调整宽度 */}
      {!topicSidebarCollapsed && (
        <>
          {/* 右侧拖拽手柄 */}
          <ResizableHandle
            direction="horizontal"
            onResize={handleTopicSidebarResize}
          />
          <div
            className="shrink-0 overflow-hidden border rounded-lg bg-background"
            style={{ width: topicSidebarWidth }}
          >
            <TopicSidebar className="h-full border-0" />
          </div>
        </>
      )}
    </div>
  );
}

