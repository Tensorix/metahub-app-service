import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/**
 * 触发文件下载
 * @param blob 文件数据
 * @param filename 文件名
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 验证导入文件
 * @param file 文件对象
 */
export function validateImportFile(file: File): { valid: boolean; error?: string } {
  // 检查文件类型
  const validExtensions = ['.json', '.jsonl', '.zip'];
  const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!hasValidExt) {
    return { valid: false, error: '仅支持 JSON、JSONL 或 ZIP 文件' };
  }
  
  // 检查文件大小 (100MB)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: '文件大小不能超过 100MB' };
  }
  
  return { valid: true };
}

/**
 * 获取会话类型显示名称
 */
export function getSessionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ai: 'AI 对话',
    pm: '私聊',
    group: '群聊',
  };
  return labels[type] || type;
}

/**
 * 格式化日期为输入框格式
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * 格式化相对时间（中文）
 * e.g. "刚刚", "5分钟前", "14:30", "昨天", "3天前", "3月15日"
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;

  // Same calendar day
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return '昨天';
  }

  if (diffDays < 7) return `${diffDays}天前`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
