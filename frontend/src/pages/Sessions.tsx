import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Upload, Archive } from 'lucide-react';
import { ChatLayout } from '@/components/chat';
import { usePageTitle } from '@/contexts/PageTitleContext';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { SessionDialog } from '@/components/SessionDialog';
import { SessionImportDialog, BatchExportDialog } from '@/components/session-transfer';
import { useChatStore } from '@/store/chat';

export function Sessions() {
  const { sessionId, topicId } = useParams<{ sessionId?: string; topicId?: string }>();
  const { setTitle, setActions } = usePageTitle();
  const { isMobile } = useBreakpoints();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const createSession = useChatStore((state) => state.createSession);
  const selectSession = useChatStore((state) => state.selectSession);
  const loadSessions = useChatStore((state) => state.loadSessions);

  useEffect(() => {
    if (isMobile) {
      setTitle('会话');
      setActions([
        {
          key: 'import',
          label: '导入',
          icon: <Upload className="h-4 w-4" />,
          onClick: () => importTriggerRef.current?.click(),
          variant: 'ghost',
        },
        {
          key: 'export',
          label: '导出',
          icon: <Archive className="h-4 w-4" />,
          onClick: () => exportTriggerRef.current?.click(),
          variant: 'ghost',
        },
        {
          key: 'create',
          label: '新建',
          icon: <Plus className="h-4 w-4" />,
          onClick: () => setShowCreateDialog(true),
          variant: 'outline',
        },
      ]);
    } else {
      setTitle(null);
      setActions([]);
    }

    return () => {
      setTitle(null);
      setActions([]);
    };
  }, [isMobile, setTitle, setActions]);

  const handleCreateSession = async (data: any) => {
    const session = await createSession({
      ...data,
      session_type: data.type,
    });
    setShowCreateDialog(false);
    await selectSession(session.id);
  };

  return (
    <div className="h-full flex flex-col">
      {/* ChatLayout 填满剩余高度 */}
      <div className="flex-1 min-h-0">
        <ChatLayout initialSessionId={sessionId} initialTopicId={topicId} />
      </div>

      <SessionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreateSession}
      />

      {/* 隐藏的触发器按钮 */}
      <div style={{ display: 'none' }}>
        <SessionImportDialog
          trigger={<button ref={importTriggerRef} />}
          onSuccess={(ids) => {
            void loadSessions();
            if (ids.length === 1) {
              void selectSession(ids[0]);
            }
          }}
        />
        <BatchExportDialog
          trigger={<button ref={exportTriggerRef} />}
        />
      </div>
    </div>
  );
}
