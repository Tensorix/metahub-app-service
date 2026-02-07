import { useParams } from 'react-router-dom';
import { ChatLayout } from '@/components/chat';

export function Sessions() {
  const { sessionId, topicId } = useParams<{ sessionId?: string; topicId?: string }>();

  return (
    <div className="h-full flex flex-col">
      {/* ChatLayout 填满剩余高度 */}
      <div className="flex-1 min-h-0">
        <ChatLayout initialSessionId={sessionId} initialTopicId={topicId} />
      </div>
    </div>
  );
}
