import type { Topic } from '@/lib/api';
import type { VirtualTopic } from '@/lib/virtualTopic';

/**
 * 与聊天区边界滚动预览一致：全量话题按 created_at 升序，当前在某一索引。
 * up → 更旧；down → 更新话题行，若已在最新则强调底部「当前」锚点。
 */
export function computeBoundaryPreview(
  allTopics: (Topic | VirtualTopic)[],
  currentTopicId: string | null,
  boundaryDirection: 'up' | 'down' | null,
): { previewTopicId: string | null; highlightAnchorDown: boolean } {
  if (!boundaryDirection || !currentTopicId) {
    return { previewTopicId: null, highlightAnchorDown: false };
  }
  const currentIndex = allTopics.findIndex((t) => t.id === currentTopicId);
  if (currentIndex < 0) {
    return { previewTopicId: null, highlightAnchorDown: false };
  }
  if (boundaryDirection === 'up') {
    if (currentIndex > 0) {
      return { previewTopicId: allTopics[currentIndex - 1]!.id, highlightAnchorDown: false };
    }
    return { previewTopicId: null, highlightAnchorDown: false };
  }
  if (currentIndex < allTopics.length - 1) {
    return { previewTopicId: allTopics[currentIndex + 1]!.id, highlightAnchorDown: false };
  }
  return { previewTopicId: null, highlightAnchorDown: true };
}
