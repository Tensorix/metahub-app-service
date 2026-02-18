import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Message, Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';
import { useChatStore } from '@/store/chat';
import { useScrollBoundary } from '@/hooks/useScrollBoundary';
import { useAIChat } from '@/hooks/useAIChat';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageInput } from '@/components/MessageInput';
import { MessageList as SimpleMessageList } from '@/components/MessageList';
import { AIMessageList } from './AIMessageList';
import { TopicDivider } from './TopicDivider';
import { ToolApprovalCard } from './ToolApprovalCard';
import { TopicSelector } from './TopicSelector';
import { TopicSidebar } from './TopicSidebar';
import { FileExplorer } from './FileExplorer';
import { SessionDialog } from '@/components/SessionDialog';
import { ResizableHandle } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Hash, Loader2, PanelRightClose, PanelRightOpen, ArrowUp, ArrowDown, Plus, Settings2, ArrowLeft, FolderOpen } from 'lucide-react';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { useToast } from '@/hooks/use-toast';

// 话题侧边栏宽度常量
const TOPIC_SIDEBAR_MIN_WIDTH = 200;
const TOPIC_SIDEBAR_MAX_WIDTH = 400;
const TOPIC_SIDEBAR_DEFAULT_WIDTH = 280;


interface MessageAreaProps {
  onBack?: () => void;
  showBackButton?: boolean;
}

export function MessageArea({ onBack, showBackButton }: MessageAreaProps) {
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
  const setRightDrawerOpen = useChatStore((state) => state.setRightDrawerOpen);
  const topicSidebarCollapsed = useChatStore((state) => state.topicSidebarCollapsed);
  const setTopicSidebarCollapsed = useChatStore((state) => state.setTopicSidebarCollapsed);
  const fileExplorerOpen = useChatStore((state) => state.fileExplorerOpen);
  const setFileExplorerOpen = useChatStore((state) => state.setFileExplorerOpen);
  const updateSession = useChatStore((state) => state.updateSession);
  
  // AI 聊天 hook
  const {
    send: sendAIMessage,
    stop: stopAIGeneration,
    isStreaming,
    pendingInterrupt,
    resumeApprove,
    resumeReject,
  } = useAIChat();

  // 直接调用函数，因为这些函数内部会从 store 获取最新状态
  const currentSession = getCurrentSession();
  const currentTopic = getCurrentTopic();
  const displayMode = getDisplayMode();
  const allTopics = getAllTopicsForSession(currentSessionId);

  const [isSessionSettingsOpen, setIsSessionSettingsOpen] = useState(false);
  
  // 话题侧边栏可调整宽度
  const [topicSidebarWidth, setTopicSidebarWidth] = useState(TOPIC_SIDEBAR_DEFAULT_WIDTH);
  // 拖拽调整大小时禁用过渡，避免动画导致右侧异常收缩
  const [topicSidebarResizing, setTopicSidebarResizing] = useState(false);
  
  
  const handleTopicSidebarResize = useCallback((delta: number) => {
    // 话题侧边栏在右侧，拖拽方向相反
    setTopicSidebarWidth((prev) =>
      Math.min(TOPIC_SIDEBAR_MAX_WIDTH, Math.max(TOPIC_SIDEBAR_MIN_WIDTH, prev - delta))
    );
  }, []);

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
  // 话题按 created_at 升序排列（最旧在 index 0，最新在末尾）
  // prevTopic = 更旧的话题 = index - 1
  // nextTopic = 更新的话题 = index + 1
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
  const prevHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          setTopHint("继续下拉查看更早的话题");
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
          setBottomHint("继续上拉查看更新的话题");
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

  // 消息底部 ref，用于滚动到最新消息
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 消息加载完成后滚动到底部
  useEffect(() => {
    if (!isLoading && (pagedMessages.length > 0 || continuousMessages.length > 0)) {
      // 使用 setTimeout 确保 DOM 已更新
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isLoading, currentTopicId, currentSessionId, pagedMessages.length, continuousMessages.length]);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 移动端返回按钮 */}
            {showBackButton && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onBack}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
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
            {/* AI 会话显示文件系统按钮 */}
            {currentSession?.type === 'ai' && (
              <Button
                size="icon"
                variant={fileExplorerOpen ? "secondary" : "ghost"}
                onClick={() => {
                  const next = !fileExplorerOpen;
                  setFileExplorerOpen(next);
                }}
                title={fileExplorerOpen ? "关闭文件系统" : "在消息区域打开文件系统"}
              >
                <FolderOpen className="h-5 w-5" />
              </Button>
            )}
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
            {/* 移动端和平板端显示话题抽屉按钮 */}
            {!isDesktop && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setRightDrawerOpen(true)}
                title="话题列表"
              >
                <Hash className="h-5 w-5" />
              </Button>
            )}
            {/* 桌面端显示话题侧边栏切换按钮 */}
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
        <div className="flex-1 flex flex-col min-w-0 h-full relative group/message-area overflow-hidden">
          {/* 消息列表 或 文件系统 - 点击文件图标时切换，带滑入滑出动画 */}
          <AnimatePresence mode="wait" initial={false}>
            {currentSession?.type === 'ai' && fileExplorerOpen && currentSessionId ? (
              <motion.div
                key="file-explorer"
                initial={{ opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 32 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="flex-1 flex flex-col min-h-0 absolute inset-0"
              >
                <FileExplorer
                  sessionId={currentSessionId}
                  topicId={currentTopicId ?? undefined}
                  className="flex-1 min-h-0"
                  onClose={() => setFileExplorerOpen(false)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="message-list"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="flex-1 flex flex-col min-h-0 absolute inset-0"
              >
          <div
            ref={messageContainerRef as React.RefObject<HTMLDivElement>}
            className={cn(
              'flex-1 overflow-y-auto px-4 py-3 scroll-smooth',
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
                  <AIMessageList className="overflow-visible p-0" />
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
             {/* 消息底部锚点 */}
             <div ref={messagesEndRef} />
            </>
          ) : (
            <>
              <ContinuousMessageList
                messages={continuousMessages}
                topics={allTopics}
                onDelete={handleDeleteMessage}
              />
              {/* 消息底部锚点 */}
              <div ref={messagesEndRef} />
            </>
          )}
          </div>
        </div>

          {/* 浮动话题切换器 - 固定在消息区域右侧（仅消息模式显示） */}
          {currentSession && displayMode === 'paged' && !fileExplorerOpen && (
            <div className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20 transition-all duration-300 group/indicator",
              "opacity-30 hover:opacity-100",
            )}>
              {/* 话题名称显示区域 - 仅hover时显示 */}
              <div className="flex flex-col items-end gap-1 mr-1 opacity-0 group-hover/indicator:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/indicator:pointer-events-auto">
                {prevTopic && (
                  <div 
                    className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-primary transition-colors max-w-[120px] truncate text-right bg-background/60 backdrop-blur-sm rounded px-1.5 py-0.5"
                    onClick={() => void navigateTopic('prev')}
                  >
                    ↑ {prevTopic.name || '未命名话题'}
                  </div>
                )}
                <div className="text-xs font-medium text-primary max-w-[140px] truncate text-right bg-background/80 backdrop-blur-sm rounded px-2 py-0.5 shadow-sm border border-primary/20">
                  {currentTopic?.name || '未命名话题'}
                </div>
                {nextTopic && (
                  <div 
                    className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-primary transition-colors max-w-[120px] truncate text-right bg-background/60 backdrop-blur-sm rounded px-1.5 py-0.5"
                    onClick={() => void navigateTopic('next')}
                  >
                    ↓ {nextTopic.name || '未命名话题'}
                  </div>
                )}
              </div>

              <div className="bg-background/90 backdrop-blur-sm border border-border/50 rounded-full shadow-md p-1 flex flex-col gap-0.5 hover:shadow-lg transition-all duration-200">
                {isDesktop && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full hover:bg-muted"
                    onClick={() => setTopicSidebarCollapsed(!topicSidebarCollapsed)}
                    title={topicSidebarCollapsed ? "展开话题列表" : "折叠话题列表"}
                  >
                    {topicSidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full hover:bg-muted"
                  disabled={!prevTopic}
                  onClick={() => void navigateTopic('prev')}
                  title="上一个话题（更早）"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full hover:bg-muted"
                  disabled={!nextTopic}
                  onClick={() => void navigateTopic('next')}
                  title="下一个话题（更新）"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

        {/* 输入框 - 文件系统模式时隐藏 */}
        {!fileExplorerOpen && (
        <div className="border-t px-4 py-3 space-y-3">
          {currentSession?.type === 'ai' && pendingInterrupt && (
            <ToolApprovalCard
              actionRequests={pendingInterrupt.action_requests}
              onApprove={resumeApprove}
              onReject={resumeReject}
            />
          )}
          {currentSession?.type === 'ai' ? (
            <MessageInput
              onSend={sendAIMessage}
              onStop={stopAIGeneration}
              isStreaming={isStreaming}
              disabled={!currentSession || !!pendingInterrupt}
            />
          ) : (
            <MessageInput
              onSend={sendMessage}
              disabled={!currentSession}
            />
          )}
        </div>
        )}
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      {/* 右侧：话题列表 (仅桌面端) */}
      {isDesktop && (
        <div
          className={cn(
            'shrink-0 flex overflow-hidden',
            !topicSidebarResizing && 'transition-[width] duration-300 ease-in-out',
            topicSidebarCollapsed && 'pointer-events-none'
          )}
          style={{ width: topicSidebarCollapsed ? 0 : topicSidebarWidth + 8 }}
        >
          <ResizableHandle
            direction="horizontal"
            onResize={handleTopicSidebarResize}
            onDragStart={() => setTopicSidebarResizing(true)}
            onDragEnd={() => setTopicSidebarResizing(false)}
          />
          <div
            className="shrink-0 overflow-hidden border-l bg-background"
            style={{ width: topicSidebarWidth }}
          >
            <TopicSidebar className="h-full" style={{ width: topicSidebarWidth }} />
          </div>
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
