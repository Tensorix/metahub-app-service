/**
 * FileExplorer component for browsing and editing files in the session filesystem.
 *
 * Features:
 * - Tree view of files
 * - File content viewing/editing
 * - Real-time updates via WebSocket
 * - Create, edit, delete files
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Plus,
  Save,
  Trash2,
  X,
  FileText,
  FileCode,
  FileJson,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import {
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  buildFileTree,
  getLanguageFromPath,
  FileWatcher,
  type FileInfo,
  type FileTreeNode,
  type FileEvent,
} from '@/lib/filesystemApi';
import { useToast } from '@/hooks/use-toast';

interface FileExplorerProps {
  sessionId: string;
  className?: string;
  onClose?: () => void;
}

export function FileExplorer({ sessionId, className, onClose }: FileExplorerProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selected file state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // New file dialog
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  
  // Expanded folders
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // File watcher
  const watcherRef = useRef<FileWatcher | null>(null);

  // Load files
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await listFiles(sessionId);
      setFiles(response.files);
      setTree(buildFileTree(response.files));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load files';
      setError(message);
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: message,
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  // Load file content
  const loadFileContent = useCallback(async (path: string) => {
    setLoadingFile(true);
    
    try {
      const response = await readFile(sessionId, path);
      setFileContent(response.content);
      setOriginalContent(response.content);
      setHasChanges(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load file';
      toast({
        variant: 'destructive',
        title: '读取失败',
        description: message,
      });
    } finally {
      setLoadingFile(false);
    }
  }, [sessionId, toast]);

  // Save file
  const saveFile = useCallback(async () => {
    if (!selectedPath || !hasChanges) return;
    
    setSaving(true);
    
    try {
      await writeFile(sessionId, selectedPath, fileContent);
      setOriginalContent(fileContent);
      setHasChanges(false);
      toast({
        title: '保存成功',
        description: `文件 ${selectedPath} 已保存`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save file';
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }, [sessionId, selectedPath, fileContent, hasChanges, toast]);

  // Create new file
  const createFile = useCallback(async () => {
    if (!newFilePath.trim()) return;
    
    const path = newFilePath.startsWith('/') ? newFilePath : `/${newFilePath}`;
    
    try {
      await writeFile(sessionId, path, '');
      setShowNewFile(false);
      setNewFilePath('');
      await loadFiles();
      setSelectedPath(path);
      setFileContent('');
      setOriginalContent('');
      toast({
        title: '创建成功',
        description: `文件 ${path} 已创建`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create file';
      toast({
        variant: 'destructive',
        title: '创建失败',
        description: message,
      });
    }
  }, [sessionId, newFilePath, loadFiles, toast]);

  // Delete file
  const handleDeleteFile = useCallback(async (path: string) => {
    if (!confirm(`确定要删除 ${path} 吗？`)) return;
    
    try {
      await deleteFile(sessionId, path);
      if (selectedPath === path) {
        setSelectedPath(null);
        setFileContent('');
        setOriginalContent('');
      }
      await loadFiles();
      toast({
        title: '删除成功',
        description: `文件 ${path} 已删除`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete file';
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: message,
      });
    }
  }, [sessionId, selectedPath, loadFiles, toast]);

  // Handle file selection
  const handleSelectFile = useCallback((path: string) => {
    if (hasChanges) {
      if (!confirm('当前文件有未保存的更改，确定要切换吗？')) {
        return;
      }
    }
    setSelectedPath(path);
    loadFileContent(path);
  }, [hasChanges, loadFileContent]);

  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Refs to hold latest values for event handler
  const selectedPathRef = useRef(selectedPath);
  const loadFilesRef = useRef(loadFiles);
  const loadFileContentRef = useRef(loadFileContent);
  
  // Keep refs updated
  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);
  
  useEffect(() => {
    loadFilesRef.current = loadFiles;
  }, [loadFiles]);
  
  useEffect(() => {
    loadFileContentRef.current = loadFileContent;
  }, [loadFileContent]);

  // Initialize - only depends on sessionId
  useEffect(() => {
    loadFilesRef.current();
    
    // Handle file change events
    const handleFileEvent = (event: FileEvent) => {
      console.log('File event:', event);
      loadFilesRef.current();
      
      // If the current file was updated externally, reload it
      if (event.path === selectedPathRef.current && event.event === 'updated') {
        loadFileContentRef.current(selectedPathRef.current);
      }
    };
    
    // Set up file watcher
    const watcher = new FileWatcher(sessionId);
    watcherRef.current = watcher;
    watcher.addListener(handleFileEvent);
    watcher.connect();
    
    return () => {
      watcher.disconnect();
    };
  }, [sessionId]);

  // Track content changes
  useEffect(() => {
    setHasChanges(fileContent !== originalContent);
  }, [fileContent, originalContent]);

  // Get icon for file
  const getFileIcon = (path: string) => {
    const lang = getLanguageFromPath(path);
    switch (lang) {
      case 'javascript':
      case 'typescript':
      case 'python':
        return <FileCode className="h-4 w-4 text-blue-500" />;
      case 'json':
        return <FileJson className="h-4 w-4 text-yellow-500" />;
      case 'markdown':
        return <FileText className="h-4 w-4 text-purple-500" />;
      default:
        return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Render file tree node
  const renderTreeNode = (node: FileTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedPath === node.path;
    
    return (
      <div key={node.path}>
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm group',
            isSelected && 'bg-accent',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.isDir) {
              toggleFolder(node.path);
            } else {
              handleSelectFile(node.path);
            }
          }}
        >
          {node.isDir ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-4" />
              {getFileIcon(node.path)}
            </>
          )}
          <span className="truncate flex-1 text-sm">{node.name}</span>
          {!node.isDir && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFile(node.path);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
        {node.isDir && isExpanded && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col h-full border-l bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="font-medium text-sm">文件系统</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={loadFiles}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowNewFile(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* New file input */}
      {showNewFile && (
        <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
          <Input
            placeholder="/path/to/file.txt"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createFile();
              if (e.key === 'Escape') {
                setShowNewFile(false);
                setNewFilePath('');
              }
            }}
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" onClick={createFile}>
            创建
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowNewFile(false);
              setNewFilePath('');
            }}
          >
            取消
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* File tree */}
        <div className="w-1/3 min-w-[150px] border-r">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-destructive">{error}</div>
            ) : files.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                暂无文件
              </div>
            ) : (
              <div className="py-1">
                {tree.map((node) => renderTreeNode(node))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* File content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPath ? (
            <>
              {/* File header */}
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2 overflow-hidden">
                  {getFileIcon(selectedPath)}
                  <span className="text-sm truncate">{selectedPath}</span>
                  {hasChanges && (
                    <span className="text-xs text-orange-500">●</span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={saveFile}
                  disabled={!hasChanges || saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-1">保存</span>
                </Button>
              </div>

              {/* File editor */}
              {loadingFile ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <textarea
                  className="flex-1 p-3 font-mono text-sm resize-none bg-background focus:outline-none"
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  placeholder="文件内容..."
                  spellCheck={false}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              选择一个文件进行查看或编辑
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
