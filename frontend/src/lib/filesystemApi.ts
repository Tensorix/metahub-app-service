/**
 * Filesystem API client for DeepAgents file system access.
 *
 * Provides:
 * - List files in session
 * - Read file content
 * - Write/update files
 * - Delete files
 * - Real-time file change notifications via WebSocket
 */

import { api } from './api';
import { getApiBaseUrl } from '@/config/env';

const API_BASE = getApiBaseUrl();

// Types
export interface FileInfo {
  path: string;
  name: string;
  is_dir: boolean;
  size: number | null;
  modified_at: string | null;
  created_at: string | null;
  lifecycle: 'thread' | 'session' | null;
  readonly: boolean;
}

export interface FileListResponse {
  files: FileInfo[];
  total: number;
}

export interface FileReadResponse {
  path: string;
  content: string;
  size: number;
  modified_at: string | null;
}

export interface FileWriteResponse {
  path: string;
  size: number;
  created: boolean;
  modified_at: string;
}

export interface FileDeleteResponse {
  path: string;
  success: boolean;
}

export interface FileEvent {
  event: 'created' | 'updated' | 'deleted';
  path: string;
  session_id: string;
  timestamp: string;
}

/**
 * List all files in a session's filesystem.
 */
export async function listFiles(
  sessionId: string,
  path: string = '/',
  topicId?: string
): Promise<FileListResponse> {
  const params: Record<string, string> = { path };
  if (topicId) params.topic_id = topicId;
  const { data } = await api.get<FileListResponse>(
    `/api/v1/sessions/${sessionId}/files`,
    { params }
  );
  return data;
}

/**
 * Read content of a specific file.
 */
export async function readFile(
  sessionId: string,
  path: string,
  topicId?: string
): Promise<FileReadResponse> {
  const params: Record<string, string> = { path };
  if (topicId) params.topic_id = topicId;
  const { data } = await api.get<FileReadResponse>(
    `/api/v1/sessions/${sessionId}/files/read`,
    { params }
  );
  return data;
}

/**
 * Write or update a file.
 */
export async function writeFile(
  sessionId: string,
  path: string,
  content: string,
  topicId?: string
): Promise<FileWriteResponse> {
  const params: Record<string, string> = {};
  if (topicId) params.topic_id = topicId;
  const { data } = await api.post<FileWriteResponse>(
    `/api/v1/sessions/${sessionId}/files/write`,
    { path, content },
    { params }
  );
  return data;
}

/**
 * Delete a file.
 */
export async function deleteFile(
  sessionId: string,
  path: string,
  topicId?: string
): Promise<FileDeleteResponse> {
  const params: Record<string, string> = { path };
  if (topicId) params.topic_id = topicId;
  const { data } = await api.delete<FileDeleteResponse>(
    `/api/v1/sessions/${sessionId}/files`,
    { params }
  );
  return data;
}

/**
 * FileWatcher class for real-time file change notifications.
 */
export class FileWatcher {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private listeners: ((event: FileEvent) => void)[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Connect to the WebSocket for file change notifications.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    // Build WebSocket URL
    const token = localStorage.getItem('access_token');
    const wsBase = API_BASE.replace(/^http/, 'ws');
    const url = `${wsBase}/api/v1/sessions/${this.sessionId}/files/watch${token ? `?token=${token}` : ''}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('FileWatcher connected');
        this.isConnecting = false;

        // Start ping interval
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('ping');
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        // Ignore pong messages
        if (event.data === 'pong') {
          return;
        }

        try {
          const fileEvent = JSON.parse(event.data) as FileEvent;
          this.notifyListeners(fileEvent);
        } catch (e) {
          console.error('Failed to parse file event:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('FileWatcher disconnected');
        this.isConnecting = false;
        this.cleanup();

        // Reconnect after delay
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, 5000);
      };

      this.ws.onerror = (error) => {
        console.error('FileWatcher error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect from the WebSocket.
   */
  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Add a listener for file change events.
   */
  addListener(listener: (event: FileEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a listener.
   */
  removeListener(listener: (event: FileEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  private notifyListeners(event: FileEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Listener error:', e);
      }
    }
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

/**
 * Build a tree structure from flat file list.
 */
export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  modifiedAt: string | null;
  readonly: boolean;
  lifecycle: string | null;
  children: FileTreeNode[];
}

export function buildFileTree(files: FileInfo[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  // Sort files by path to ensure parent directories are processed first
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/').filter(Boolean);
    let currentPath = '';
    let parent: FileTreeNode[] = root;

    // Create intermediate directories
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += '/' + parts[i];
      
      if (!nodeMap.has(currentPath)) {
        const dirNode: FileTreeNode = {
          name: parts[i],
          path: currentPath,
          isDir: true,
          size: null,
          modifiedAt: null,
          readonly: false,
          lifecycle: null,
          children: [],
        };
        nodeMap.set(currentPath, dirNode);
        parent.push(dirNode);
      }
      
      parent = nodeMap.get(currentPath)!.children;
    }

    // Add the file node
    const fileNode: FileTreeNode = {
      name: file.name,
      path: file.path,
      isDir: file.is_dir,
      size: file.size,
      modifiedAt: file.modified_at,
      readonly: file.readonly ?? false,
      lifecycle: file.lifecycle ?? null,
      children: [],
    };
    
    // Avoid duplicates
    if (!nodeMap.has(file.path)) {
      nodeMap.set(file.path, fileNode);
      parent.push(fileNode);
    }
  }

  return root;
}

/**
 * Get file extension from path.
 */
export function getFileExtension(path: string): string {
  const name = path.split('/').pop() || '';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * Get language for syntax highlighting based on file extension.
 */
export function getLanguageFromPath(path: string): string {
  const ext = getFileExtension(path);
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'md': 'markdown',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'txt': 'plaintext',
  };
  return languageMap[ext] || 'plaintext';
}
