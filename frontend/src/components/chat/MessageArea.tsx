import { useMemo, useState, useRef } from 'react';
import type { Message, Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { useScrollBoundary } from '@/hooks/useScrollBoundary';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageInput } from '@/components/MessageInput';
import { MessageList as SimpleMessageList } from '@/components/MessageList';
import { AIMessageInput } from './AIMessageInput';
import { AIMessageList } from './AIMessageList';
import { TopicDivider } from './TopicDivider';
import { TopicSelector } from './TopicSelector';
import { TopicSidebar } from './TopicSidebar';
import { SessionDialog } from '@/components/SessionDialog';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Menu, Hash, Loader2, PanelRightClose, PanelRightOpen, ArrowUp, ArrowDown, Plus, Settings2 } from 'lucide-react';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { useToast } from '@/hooks/use-toast';

export function MessageArea() {
  const { isDesktop } = useBreakpoints();
  const { toast } = useToast();
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
  const createTopic = useChatStore((state) => state.createTopic);
  const selectTopic = useChatStore((state) => state.selectTopic);
  const setLeftDrawerOpen = useChatStore((state) => state.setLeftDrawerOpen);
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);
  const topicSidebarCollapsed = useChatStore((state) => state.topicSidebarCollapsed);
  const setTopicSidebarCollapsed = useChatStore((state) => state.setTopicSidebarCollapsed);
  const updateSession = useChatStore((state) => state.updateSession);

  // 直接调用函数，因为这些函数内部会从 store 获取最新状态
  const currentSession = getCurrentSession();
  const currentTopic = getCurrentTopic();
  const displayMode = getDisplayMode();
  const allTopics = getAllTopicsForSession(currentSessionId);

  const [isSessionSettingsOpen, setIsSessionSettingsOpen] = useState(false);

  const handleUpdateSession = async (data: any) => {
    if (!currentSessionId) return;
    try {
      await updateSession(currentSessionId, data);
      toast({
        title: "会话已更新",
        description: "会话信息修改成功",
      });
    } catch (error) {
      console.error("Failed to update session", error);
      toast({
        variant: "destructive",
        title: "更新失败",
        description: "请稍后重试",
      });
    }
  };

  const currentIndex = allTopics.findIndex((t) => t.id === currentTopicId);
  const prevTopic = currentIndex > 0 ? allTopics[currentIndex - 1] : null;
  const nextTopic =
    currentIndex >= 0 && currentIndex < allTopics.length - 1
      ? allTopics[currentIndex + 1]
      : null;

  // 滚动切换提示状态
  const [canSwitchPrev, setCanSwitchPrev] = useState(false);
  const [canSwitchNext, setCanSwitchNext] = useState(false);
  const [topHint, setTopHint] = useState<string | null>(null);
  const [bottomHint, setBottomHint] = useState<string | null>(null);
  const prevHintTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const nextHintTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const resetTopHint = () => {
    setTopHint(null);
    setCanSwitchPrev(false);
  };

  const resetBottomHint = () => {
    setBottomHint(null);
    setCanSwitchNext(false);
  };

  const { ref: messageContainerRef } = useScrollBoundary<HTMLDivElement>({
    onTopBoundary: () => {
      if (canSwitchPrev) {
        if (prevTopic) {
          navigateTopic('prev');
        }
        resetTopHint();
        if (prevHintTimeoutRef.current) clearTimeout(prevHintTimeoutRef.current);
      } else {
        if (prevTopic) {
          setTopHint("继续下拉切换到上一个话题");
          setCanSwitchPrev(true);
        } else {
          setTopHint("没有更多历史消息了");
        }
        
        if (prevHintTimeoutRef.current) clearTimeout(prevHintTimeoutRef.current);
        // 2秒后重置状态
        prevHintTimeoutRef.current = setTimeout(resetTopHint, 2000);
      }
    },
    onBottomBoundary: async () => {
      if (canSwitchNext) {
        if (nextTopic) {
          navigateTopic('next');
        } else if (currentSessionId && currentTopicId) {
          // 检查当前话题是否为空
          const currentMsgs = messages[currentTopicId] || [];
          if (currentMsgs.length > 0) {
             // 创建新话题
             try {
               const newTopic = await createTopic(currentSessionId);
               await selectTopic(newTopic.id);
             } catch (error) {
               console.error("Failed to create topic", error);
               toast({
                 variant: "destructive",
                 title: "创建话题失败",
                 description: "请稍后重试",
               });
             }
          }
        }
        resetBottomHint();
        if (nextHintTimeoutRef.current) clearTimeout(nextHintTimeoutRef.current);
      } else {
        if (nextTopic) {
          setBottomHint("继续上拉切换到下一个话题");
          setCanSwitchNext(true);
        } else {
           // 检查当前话题是否为空
           const currentMsgs = currentTopicId ? (messages[currentTopicId] || []) : [];
           if (currentMsgs.length > 0) {
             setBottomHint("继续上拉创建新话题");
             setCanSwitchNext(true);
           } else {
             setBottomHint("已经是最新话题");
           }
        }

        if (nextHintTimeoutRef.current) clearTimeout(nextHintTimeoutRef.current);
        // 2秒后重置状态
        nextHintTimeoutRef.current = setTimeout(resetBottomHint, 2000);
      }
    },
    enableState: false, // 禁用内部 state 更新以避免重渲染
  });

  const handleDeleteMessage = async (messageId: string) => {
    await deleteMessage(messageId);
  };

  const handleCreateNewTopic = async () => {
    if (!currentSessionId) return;
    try {
      const newTopic = await createTopic(currentSessionId);
      await selectTopic(newTopic.id);
      toast({
        title: "话题已创建",
        description: "当前会话已保存为历史话题",
      });
    } catch (error) {
      console.error("Failed to create topic", error);
      toast({
        variant: "destructive",
        title: "创建话题失败",
        description: "请稍后重试",
      });
    }
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
    <Card className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 shrink-0">
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
            {currentSession && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsSessionSettingsOpen(true)}
                title="会话设置"
              >
                <Settings2 className="h-5 w-5" />
              </Button>
            )}
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

      <div className="flex-1 flex flex-row min-h-0">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* 消息列表 */}
          <div
            ref={messageContainerRef}
            className={cn(
              'flex-1 overflow-y-auto px-4 py-3 relative group/message-area scroll-smooth',
              !currentSession && 'flex items-center justify-center',
            )}
          >
          <div
            className={cn("min-h-full w-full flex flex-col", !currentSession && "flex items-center justify-center")}
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
              {/* 顶部提示 */}
              {topHint && (
                <div className="flex items-center justify-center py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="bg-muted/80 backdrop-blur-sm text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5">
                    {canSwitchPrev && <ArrowUp className="h-3 w-3" />}
                    {topHint}
                  </div>
                </div>
              )}

              <div className="flex-1">
                {currentSession?.type === 'ai' ? (
                  <AIMessageList />
                ) : (
                  <SimpleMessageList
                    messages={pagedMessages}
                    onDelete={handleDeleteMessage}
                  />
                )}
              </div>

              {/* 底部提示 */}
              {bottomHint && (
                <div className="flex items-center justify-center py-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                   <div className="bg-muted/80 backdrop-blur-sm text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5">
                    {canSwitchNext && (bottomHint.includes("新建") ? <Plus className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    {bottomHint}
                  </div>
                </div>
              )}
              
              {/* 浮动话题切换器 (保留，作为快捷操作) */}
             {currentSession && (
               <div className={cn(
                 "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 transition-all duration-200 group/indicator pointer-events-none",
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

                  <div className="bg-background/20 backdrop-blur-[1px] border border-border/20 rounded-full shadow-sm p-0.5 flex flex-col gap-0.5 hover:bg-background/80 hover:border-border transition-all duration-200 pointer-events-auto">
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
          </div>
        </div>

        {/* 输入框 */}
        <div className="border-t px-4 py-3">
          {currentSession?.type === 'ai' ? (
            <AIMessageInput disabled={!currentSession} />
          ) : (
            <MessageInput
              onSend={sendMessage}
              onCreateTopic={handleCreateNewTopic}
              disabled={!currentSession}
            />
          )}
        </div>
      </div>

      {/* 右侧：话题列表 (仅桌面端且未折叠) */}
      {isDesktop && !topicSidebarCollapsed && (
        <div className="w-72 border-l bg-background shrink-0">
          <TopicSidebar className="h-full border-0" />
        </div>
      )}
      </div>
      {/* Session Settings Dialog */}
      <SessionDialog
        open={isSessionSettingsOpen}
        onOpenChange={setIsSessionSettingsOpen}
        session={currentSession || undefined}
        onSubmit={handleUpdateSession}
      />
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
