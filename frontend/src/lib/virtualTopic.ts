import type { Message, Topic } from '@/lib/api';

const VIRTUAL_TOPIC_TIME_GAP = 30 * 60 * 1000; // 30 分钟

export interface VirtualTopic extends Topic {
  is_virtual: true;
  message_ids: string[];
}

/**
 * 根据孤立消息计算虚拟话题
 * 按时间间隔 30 分钟分组
 */
export function computeVirtualTopics(
  orphanMessages: Message[],
  sessionId: string,
): VirtualTopic[] {
  if (orphanMessages.length === 0) return [];

  const sorted = [...orphanMessages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const groups: Message[][] = [];
  let currentGroup: Message[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].created_at).getTime();
    const currTime = new Date(sorted[i].created_at).getTime();

    if (currTime - prevTime > VIRTUAL_TOPIC_TIME_GAP) {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    } else {
      currentGroup.push(sorted[i]);
    }
  }

  groups.push(currentGroup);

  return groups.map((group, index) => {
    const firstMsg = group[0];
    const date = new Date(firstMsg.created_at);
    const dateStr = date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return {
      id: `virtual-${sessionId}-${index}`,
      name: `历史对话 ${dateStr}`,
      session_id: sessionId,
      created_at: firstMsg.created_at,
      updated_at: group[group.length - 1].created_at,
      is_deleted: false,
      is_virtual: true as const,
      message_ids: group.map((m) => m.id),
    };
  });
}

export function getVirtualTopicMessages(
  virtualTopic: VirtualTopic,
  allMessages: Message[],
): Message[] {
  const messageIdSet = new Set(virtualTopic.message_ids);
  return allMessages.filter((m) => messageIdSet.has(m.id));
}

