import { useMemo } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import type { Message, Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { useScrollBoundary } from '@/hooks/useScrollBoundary';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageInput } from '@/components/MessageInput';
import { MessageList as SimpleMessageList } from '@/components/MessageList';
import { TopicDivider } from './TopicDivider';
import { TopicSelector } from './TopicSelector';
import { TopicSidebar } from './TopicSidebar';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Menu, Hash, Loader2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useBreakpoints } from '@/hooks/useMediaQuery';

export function MessageArea() {
  const { isDesktop } = useBreakpoints();
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const currentTopicId = useChatStore((state) => state.currentTopicId);
  const messages = useChatStore((state) => state.messages);
  const sessionMessages = useChatStore((state) => state.sessionMessages);
  const getCurrentSession = useChatStore((state) => state.getCurrentSession);
  const getCurrentTopic = useChatStore((state) => state.getCurrentTopic);
  const getDisplayMode = useChatStore((state) => state.getDisplayMode);
  const getAllTopicsForSession = useChatStore((state) => state.getAllTopicsForSession);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const navigateTopic = useChatStore((state) => state.navigateTopic);
  const setLeftDrawerOpen = useChatStore((state) => state.setLeftDrawerOpen);
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);
  const topicSidebarCollapsed = useChatStore((state) => state.topicSidebarCollapsed);
  const setTopicSidebarCollapsed = useChatStore((state) => state.setTopicSidebarCollapsed);

  // 直接调用函数，因为这些函数内部会从 store 获取最新状态
  const currentSession = getCurrentSession();
  const currentTopic = getCurrentTopic();
  const displayMode = getDisplayMode();
  const allTopics = getAllTopicsForSession(currentSessionId);

  const currentIndex = allTopics.findIndex((t) => t.id === currentTopicId);
  const prevTopic = currentIndex > 0 ? allTopics[currentIndex - 1] : null;
  const nextTopic =
    currentIndex >= 0 && currentIndex < allTopics.length - 1
      ? allTopics[currentIndex + 1]
      : null;

  const setBoundaryState = useChatStore((state) => state.setBoundaryState);

  // 动画状态
  const dragY = useMotionValue(0);
  const y = useSpring(dragY, { stiffness: 300, damping: 25 });

  const { ref: messageContainerRef } = useScrollBoundary<HTMLDivElement>({
    onTopBoundary: () => void navigateTopic('prev'),
    onBottomBoundary: () => void navigateTopic('next'),
    enableState: false, // 禁用内部 state 更新以避免重渲染
    onProgress: (progress, direction) => {
      // 直接驱动动画值
      if (direction === 'up') {
        dragY.set(progress * 1.5);
      } else if (direction === 'down') {
        dragY.set(-progress * 1.5);
      } else {
        dragY.set(0);
      }
      
      // 同步到 store (如果需要的话，注意这可能会导致重渲染，如果 store 更新频繁)
      // 这里的 setBoundaryState 实际上是用来控制 UI 上的一些视觉反馈（如箭头），如果它导致重渲染，也会影响性能
      // 但我们主要关注的是列表滚动的流畅度。如果箭头只是小组件，可能还好。
      // 为了彻底解决闪烁，我们可以先不频繁更新 store，或者 store 的订阅者优化过。
      setBoundaryState(progress, direction);
    },
  });

  // 移除原来的 useEffect 同步
  // useEffect(() => {
  //   setBoundaryState(progress, direction);
  // }, [progress, direction, setBoundaryState]);

  const handleDeleteMessage = async (messageId: string) => {
    await deleteMessage(messageId);
  };

  const headerTitle =
    currentSession?.name || (currentSession ? '未命名会话' : '请选择会话');

  const messagesLoading = useChatStore((state) => state.messagesLoading);
  const pagedMessages =
    displayMode === 'paged' && currentTopicId
      ? messages[currentTopicId] ?? []
      : [];

  const continuousMessages =
    displayMode === 'continuous' && currentSessionId
      ? sessionMessages[currentSessionId] ?? []
      : [];

  const isLoading = currentTopicId
    ? messagesLoading[currentTopicId]
    : currentSessionId
      ? messagesLoading[currentSessionId]
      : false;

  return (
    <Card className="flex h-full flex-row overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {!isDesktop && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setLeftDrawerOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate">{headerTitle}</h2>
                {displayMode === 'paged' && currentSession && (
                  <div className="mt-1">
                    <TopicSelector />
                  </div>
                )}
                {displayMode === 'continuous' && currentSession && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    连续模式：所有消息按时间排序
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isDesktop && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setRightDrawerOpen(true)}
                >
                  <Hash className="h-5 w-5" />
                </Button>
              )}
              {isDesktop && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setTopicSidebarCollapsed(!topicSidebarCollapsed)}
                title={topicSidebarCollapsed ? "展开话题列表" : "折叠话题列表"}
              >
                {topicSidebarCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 消息列表 */}
        <div
          ref={messageContainerRef}
          className={cn(
            'flex-1 overflow-y-auto px-4 py-3 relative group/message-area',
            !currentSession && 'flex items-center justify-center',
          )}
        >
          <motion.div
            className={cn("min-h-full w-full", !currentSession && "flex items-center justify-center")}
            style={{ y }}
          >
          {!currentSession ? (
            <p className="text-sm text-muted-foreground">
              左侧选择一个会话开始对话。
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayMode === 'paged' ? (
            <>
              <SimpleMessageList
                messages={pagedMessages}
                onDelete={handleDeleteMessage}
              />
              
              {/* 浮动话题切换器 */}
             {currentSession && (
               <div className={cn(
                 "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 transition-all duration-200 group/indicator",
                 "opacity-0 group-hover/message-area:opacity-100",
               )}>
                  {/* 话题名称显示区域 - 仅hover时显示 */}
                  <div className="flex flex-col items-end gap-1 mr-1 opacity-0 group-hover/indicator:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/indicator:pointer-events-auto">
                    {prevTopic && (
                      <div 
                        className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-primary transition-colors max-w-[100px] truncate text-right"
                        onClick={() => void navigateTopic('prev')}
                      >
                        {prevTopic.name || '未命名话题'}
                      </div>
                    )}
                    <div className="text-xs font-medium text-primary max-w-[120px] truncate text-right shadow-sm bg-background/50 backdrop-blur-[1px] rounded px-1">
                      {currentTopic?.name || '未命名话题'}
                    </div>
                    {nextTopic && (
                      <div 
                        className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-primary transition-colors max-w-[100px] truncate text-right"
                        onClick={() => void navigateTopic('next')}
                      >
                        {nextTopic.name || '未命名话题'}
                      </div>
                    )}
                  </div>

                  <div className="bg-background/20 backdrop-blur-[1px] border border-border/20 rounded-full shadow-sm p-0.5 flex flex-col gap-0.5 hover:bg-background/80 hover:border-border transition-all duration-200">
                    {isDesktop && (
                       <Button
                         size="icon"
                         variant="ghost"
                         className="h-6 w-6 rounded-full hover:bg-muted/50"
                         onClick={() => setTopicSidebarCollapsed(!topicSidebarCollapsed)}
                         title={topicSidebarCollapsed ? "展开话题列表" : "折叠话题列表"}
                       >
                         {topicSidebarCollapsed ? <PanelRightOpen className="h-3 w-3 opacity-50 hover:opacity-100" /> : <PanelRightClose className="h-3 w-3 opacity-50 hover:opacity-100" />}
                       </Button>
                     )}
                    <Button
                       size="icon"
                       variant="ghost"
                       className="h-6 w-6 rounded-full hover:bg-muted/50"
                       disabled={!prevTopic}
                       onClick={() => void navigateTopic('prev')}
                       title="上一个话题"
                     >
                       <ChevronUp className="h-3 w-3 opacity-50 hover:opacity-100" />
                     </Button>
                     <Button
                       size="icon"
                       variant="ghost"
                       className="h-6 w-6 rounded-full hover:bg-muted/50"
                       disabled={!nextTopic}
                       onClick={() => void navigateTopic('next')}
                       title="下一个话题"
                     >
                       <ChevronDown className="h-3 w-3 opacity-50 hover:opacity-100" />
                     </Button>
                  </div>
               </div>
             )}
            </>
          ) : (
            <ContinuousMessageList
              messages={continuousMessages}
              topics={allTopics}
              onDelete={handleDeleteMessage}
            />
          )}
          </motion.div>
        </div>

        {/* 输入框 */}
        <div className="border-t px-4 py-3">
          <MessageInput
            onSend={sendMessage}
            disabled={!currentSession}
          />
        </div>
      </div>

      {/* 右侧：话题列表 (仅桌面端且未折叠) */}
      {isDesktop && !topicSidebarCollapsed && (
        <div className="w-72 border-l bg-background shrink-0">
          <TopicSidebar className="h-full border-0" />
        </div>
      )}
    </Card>
  );
}

interface ContinuousMessageListProps {
  messages: Message[];
  topics: (Topic | VirtualTopic)[];
  onDelete: (messageId: string) => void;
}

function ContinuousMessageList({
  messages,
  topics,
  onDelete,
}: ContinuousMessageListProps) {
  const selectTopic = useChatStore((state) => state.selectTopic);
  const getAllTopicsForSession = useChatStore((state) => state.getAllTopicsForSession);
  const currentSessionId = useChatStore((state) => state.currentSessionId);

  const topicMap = (() => {
    const list = currentSessionId
      ? getAllTopicsForSession(currentSessionId)
      : topics;
    return Object.fromEntries(list.map((t) => [t.id, t]));
  })();

  // 按话题分组消息
  const groups = useMemo(() => {
    const result: { topicId: string | null; topicName: string; messages: Message[] }[] = [];
    let currentGroup: Message[] = [];
    let lastTopicId: string | null | undefined = null;

    for (const msg of messages ?? []) {
      if (msg.topic_id !== lastTopicId) {
        if (currentGroup.length > 0) {
          const topic = lastTopicId ? topicMap[lastTopicId] : null;
          result.push({
            topicId: lastTopicId ?? null,
            topicName: topic?.name || '未命名话题',
            messages: currentGroup,
          });
        }
        currentGroup = [msg];
        lastTopicId = msg.topic_id ?? null;
      } else {
        currentGroup.push(msg);
      }
    }
    if (currentGroup.length > 0) {
      const topic = lastTopicId ? topicMap[lastTopicId] : null;
      result.push({
        topicId: lastTopicId,
        topicName: topic?.name || '未命名话题',
        messages: currentGroup,
      });
    }
    return result;
  }, [messages, topicMap]);

  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        暂无消息
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, idx) => (
        <div key={group.topicId || idx}>
          {idx > 0 && group.topicId && (
            <TopicDivider
              topicName={group.topicName}
              onClick={() => selectTopic(group.topicId!)}
            />
          )}
          <SimpleMessageList
            messages={group.messages}
            onDelete={onDelete}
          />
        </div>
      ))}
    </div>
  );
}

