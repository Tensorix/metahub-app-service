import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ChatLayout } from '@/components/chat';
import { usePageTitle } from '@/contexts/PageTitleContext';
import { useBreakpoints } from '@/hooks/useMediaQuery';

export function Sessions() {
  const { sessionId, topicId } = useParams<{ sessionId?: string; topicId?: string }>();
  const { setHideTopBar } = usePageTitle();
  const { isMobile } = useBreakpoints();

  useEffect(() => {
    if (isMobile) {
      setHideTopBar(true);
    }
    return () => setHideTopBar(false);
  }, [isMobile, setHideTopBar]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <ChatLayout initialSessionId={sessionId} initialTopicId={topicId} />
      </div>
    </div>
  );
}
