import { useBreakpoints } from '@/hooks/useMediaQuery';
import { useChatStore } from '@/store/chat';
import { cn } from '@/lib/utils';
import { SessionSidebar } from './SessionSidebar';
import { MessageArea } from './MessageArea';
import { TopicSidebar } from './TopicSidebar';

interface ChatLayoutProps {
  className?: string;
}

export function ChatLayout({ className }: ChatLayoutProps) {
  const { isDesktop } = useBreakpoints();
  const leftDrawerOpen = useChatStore((state) => state.leftDrawerOpen);
  const rightDrawerOpen = useChatStore((state) => state.rightDrawerOpen);
  const setLeftDrawerOpen = useChatStore((state) => state.setLeftDrawerOpen);
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);
  const topicSidebarCollapsed = useChatStore((state) => state.topicSidebarCollapsed);

  return (
    <div className={cn('flex h-full gap-4', className)}>
      {/* 左侧：会话列表 */}
      {isDesktop ? (
        <div className="w-80 shrink-0 border rounded-lg bg-background">
          <SessionSidebar />
        </div>
      ) : (
        <>
          {leftDrawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setLeftDrawerOpen(false)}
            />
          )}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] border-r bg-background transition-transform',
              leftDrawerOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <SessionSidebar />
          </div>
        </>
      )}

      {/* 右侧：消息区域（内含话题选择器）*/}
      <div className="flex-1 min-w-0">
        <MessageArea />
      </div>

      {/* 移动端：右侧抽屉 - 话题列表 */}
      {!isDesktop && (
        <>
          {rightDrawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setRightDrawerOpen(false)}
            />
          )}
          <div
            className={cn(
              'fixed inset-y-0 right-0 z-50 w-72 max-w-[80vw] border-l bg-background transition-transform',
              rightDrawerOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <TopicSidebar />
          </div>
        </>
      )}
    </div>
  );
}

