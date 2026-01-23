import { ChatLayout } from '@/components/chat';

export function Sessions() {
  return (
    <div className="h-full flex flex-col">
      {/* ChatLayout 填满剩余高度 */}
      <div className="flex-1 min-h-0">
        <ChatLayout />
      </div>
    </div>
  );
}
