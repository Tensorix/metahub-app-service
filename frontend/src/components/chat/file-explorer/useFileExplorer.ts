/**
 * Core hook for FileExplorer state and operations.
 * Manages file tree, selection, CRUD, WebSocket, drag-move, and inline create/rename.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  createFolder,
  moveFile,
  uploadFile,
  buildFileTree,
  FileWatcher,
  type FileInfo,
  type FileTreeNode,
  type FileEvent,
} from '@/lib/filesystemApi';
import { useToast } from '@/hooks/use-toast';

export interface InlineCreateState {
  parentPath: string;
  type: 'file' | 'folder';
}

export interface InlineRenameState {
  path: string;
  name: string;
}

export function useFileExplorer(sessionId: string, topicId?: string) {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedReadonly, setSelectedReadonly] = useState(false);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [showNewFile, setShowNewFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [inlineCreate, setInlineCreate] = useState<InlineCreateState | null>(null);
  const [inlineCreateValue, setInlineCreateValue] = useState('');
  const [inlineRename, setInlineRename] = useState<InlineRenameState | null>(null);

  const [uploadTargetDir, setUploadTargetDir] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const watcherRef = useRef<FileWatcher | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listFiles(sessionId, '/', topicId);
      setFiles(response.files);
      setTree(buildFileTree(response.files));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load files';
      setError(message);
      toast({ variant: 'destructive', title: '加载失败', description: message });
    } finally {
      setLoading(false);
    }
  }, [sessionId, topicId, toast]);

  const loadFileContent = useCallback(
    async (path: string) => {
      setLoadingFile(true);
      try {
        const response = await readFile(sessionId, path, topicId);
        setFileContent(response.content);
        setOriginalContent(response.content);
        setHasChanges(false);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to load file';
        toast({ variant: 'destructive', title: '读取失败', description: message });
      } finally {
        setLoadingFile(false);
      }
    },
    [sessionId, topicId, toast]
  );

  const saveFile = useCallback(async () => {
    if (!selectedPath || !hasChanges) return;
    setSaving(true);
    try {
      await writeFile(sessionId, selectedPath, fileContent, topicId);
      setOriginalContent(fileContent);
      setHasChanges(false);
      toast({ title: '保存成功', description: `文件 ${selectedPath} 已保存` });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save file';
      toast({ variant: 'destructive', title: '保存失败', description: message });
    } finally {
      setSaving(false);
    }
  }, [sessionId, topicId, selectedPath, fileContent, hasChanges, toast]);

  const createFileAtPath = useCallback(
    async (path: string) => {
      const p = path.startsWith('/') ? path : `/${path}`;
      try {
        await writeFile(sessionId, p, '', topicId);
        await loadFiles();
        setInlineCreate(null);
        setSelectedPath(p);
        setFileContent('');
        setOriginalContent('');
        toast({ title: '创建成功', description: `文件 ${p} 已创建` });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to create file';
        toast({ variant: 'destructive', title: '创建失败', description: message });
      }
    },
    [sessionId, topicId, loadFiles, toast]
  );

  const createFolderAtPath = useCallback(
    async (path: string) => {
      const p = path.startsWith('/') ? path : `/${path}`;
      try {
        await createFolder(sessionId, p, topicId);
        await loadFiles();
        setInlineCreate(null);
        setExpandedFolders((prev) => new Set(prev).add(p));
        toast({ title: '创建成功', description: `文件夹 ${p} 已创建` });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to create folder';
        toast({ variant: 'destructive', title: '创建失败', description: message });
      }
    },
    [sessionId, topicId, loadFiles, toast]
  );

  const handleDelete = useCallback(
    async (path: string, isDir: boolean) => {
      const msg = isDir ? `确定要删除文件夹 ${path} 及其所有内容吗？` : `确定要删除 ${path} 吗？`;
      if (!confirm(msg)) return;
      try {
        await deleteFile(sessionId, path, topicId, isDir);
        if (selectedPath === path || (isDir && path !== '/' && selectedPath?.startsWith(path))) {
          setSelectedPath(null);
          setFileContent('');
          setOriginalContent('');
        }
        await loadFiles();
        toast({ title: '删除成功', description: `${path} 已删除` });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete';
        toast({ variant: 'destructive', title: '删除失败', description: message });
      }
    },
    [sessionId, topicId, selectedPath, loadFiles, toast]
  );

  const handleMove = useCallback(
    async (source: string, destination: string) => {
      try {
        await moveFile(sessionId, source, destination, topicId);
        await loadFiles();
        if (selectedPath === source) {
          setSelectedPath(destination);
          loadFileContent(destination);
        } else if (selectedPath?.startsWith(source + '/')) {
          const suffix = selectedPath.slice(source.length);
          setSelectedPath(destination + suffix);
          loadFileContent(destination + suffix);
        }
        setInlineRename(null);
        toast({ title: '操作成功', description: `已移动 ${source} → ${destination}` });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to move';
        toast({ variant: 'destructive', title: '移动失败', description: message });
      }
    },
    [sessionId, topicId, selectedPath, loadFiles, loadFileContent, toast]
  );

  const handleUpload = useCallback(
    async (file: File, targetDir: string = '/workspace') => {
      setIsUploading(true);
      try {
        await uploadFile(sessionId, file, targetDir, topicId);
        await loadFiles();
        setUploadTargetDir(null);
        toast({ title: '上传成功', description: `已上传 ${file.name}` });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to upload';
        toast({ variant: 'destructive', title: '上传失败', description: message });
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId, topicId, loadFiles, toast]
  );

  const triggerUpload = useCallback(
    (targetDir: string = '/workspace') => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from((e.target as HTMLInputElement).files ?? []);
        for (const file of files) {
          await handleUpload(file, targetDir);
        }
      };
      input.click();
    },
    [handleUpload]
  );

  const handleSelectFile = useCallback(
    (path: string, readonly: boolean = false) => {
      if (hasChanges && !confirm('当前文件有未保存的更改，确定要切换吗？')) return;
      setSelectedPath(path);
      setSelectedReadonly(readonly);
      loadFileContent(path);
    },
    [hasChanges, loadFileContent]
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const createFileFromHeader = useCallback(async () => {
    if (!newFilePath.trim()) return;
    const path = newFilePath.startsWith('/') ? newFilePath : `/${newFilePath}`;
    await createFileAtPath(path);
    setShowNewFile(false);
    setNewFilePath('');
  }, [newFilePath, createFileAtPath]);

  const selectedPathRef = useRef(selectedPath);
  const loadFilesRef = useRef(loadFiles);
  const loadFileContentRef = useRef(loadFileContent);

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);
  useEffect(() => {
    loadFilesRef.current = loadFiles;
  }, [loadFiles]);
  useEffect(() => {
    loadFileContentRef.current = loadFileContent;
  }, [loadFileContent]);

  useEffect(() => {
    loadFilesRef.current();
    const handleFileEvent = (event: FileEvent) => {
      loadFilesRef.current();
      if (event.path === selectedPathRef.current && event.event === 'updated') {
        loadFileContentRef.current(selectedPathRef.current!);
      }
    };
    const watcher = new FileWatcher(sessionId);
    watcherRef.current = watcher;
    watcher.addListener(handleFileEvent);
    watcher.connect();
    return () => watcher.disconnect();
  }, [sessionId, topicId]);

  useEffect(() => {
    setHasChanges(fileContent !== originalContent);
  }, [fileContent, originalContent]);

  return {
    // Tree
    files,
    tree,
    loading,
    error,
    loadFiles,
    expandedFolders,
    toggleFolder,

    // Selection & Editor
    selectedPath,
    selectedReadonly,
    fileContent,
    setFileContent,
    loadingFile,
    saving,
    hasChanges,
    saveFile,
    handleSelectFile,

    // Header create
    showNewFile,
    setShowNewFile,
    newFilePath,
    setNewFilePath,
    createFileFromHeader,

    // Inline create / rename
    inlineCreate,
    setInlineCreate,
    inlineCreateValue,
    setInlineCreateValue,
    inlineRename,
    setInlineRename,
    onNewFile: useCallback(
      (p: string) => {
        setExpandedFolders((prev) => new Set(prev).add(p));
        setInlineCreate({ parentPath: p, type: 'file' });
        setInlineCreateValue('');
      },
      []
    ),
    onNewFolder: useCallback(
      (p: string) => {
        setExpandedFolders((prev) => new Set(prev).add(p));
        setInlineCreate({ parentPath: p, type: 'folder' });
        setInlineCreateValue('');
      },
      []
    ),
    createFileAtPath,
    createFolderAtPath,
    handleMove,

    // Delete
    handleDelete,

    // Upload
    handleUpload,
    triggerUpload,
    uploadTargetDir,
    setUploadTargetDir,
    isUploading,
  };
}
