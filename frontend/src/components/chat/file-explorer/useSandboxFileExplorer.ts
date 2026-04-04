/**
 * Hook for browsing sandbox files.
 * Same interface shape as useFileExplorer but backed by sandboxApi.
 */

import { useState, useEffect, useCallback } from 'react';
import { sandboxApi, type SandboxFileInfo } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export interface SandboxFileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  children?: SandboxFileTreeNode[];
}

function buildTree(files: SandboxFileInfo[]): SandboxFileTreeNode[] {
  // Files from the search API are already at a single level
  return files
    .sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((f) => ({
      name: f.name,
      path: f.path,
      isDir: f.is_dir,
      size: f.size,
    }));
}

export function useSandboxFileExplorer(sessionId: string) {
  const { toast } = useToast();
  const [files, setFiles] = useState<SandboxFileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('/');

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHasChanges(fileContent !== originalContent);
  }, [fileContent, originalContent]);

  const loadFiles = useCallback(
    async (path = currentPath) => {
      setLoading(true);
      setError(null);
      try {
        const result = await sandboxApi.listFiles(sessionId, path);
        setFiles(buildTree(result));
        setCurrentPath(path);
      } catch (err: any) {
        setError(err?.response?.data?.detail || String(err));
      } finally {
        setLoading(false);
      }
    },
    [sessionId, currentPath],
  );

  useEffect(() => {
    loadFiles('/');
  }, [sessionId]);

  const handleSelectFile = useCallback(
    async (path: string, isDir: boolean) => {
      if (isDir) {
        await loadFiles(path);
        return;
      }
      setSelectedPath(path);
      setLoadingFile(true);
      try {
        const content = await sandboxApi.readFile(sessionId, path);
        setFileContent(content);
        setOriginalContent(content);
      } catch (err: any) {
        toast({
          title: '读取文件失败',
          description: err?.response?.data?.detail || String(err),
          variant: 'destructive',
        });
      } finally {
        setLoadingFile(false);
      }
    },
    [sessionId, toast, loadFiles],
  );

  const saveFile = useCallback(async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      await sandboxApi.writeFile(sessionId, selectedPath, fileContent);
      setOriginalContent(fileContent);
      toast({ title: '文件已保存' });
    } catch (err: any) {
      toast({
        title: '保存失败',
        description: err?.response?.data?.detail || String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [sessionId, selectedPath, fileContent, toast]);

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        await sandboxApi.deleteFile(sessionId, path);
        toast({ title: '文件已删除' });
        if (selectedPath === path) {
          setSelectedPath(null);
          setFileContent('');
          setOriginalContent('');
        }
        await loadFiles();
      } catch (err: any) {
        toast({
          title: '删除失败',
          description: err?.response?.data?.detail || String(err),
          variant: 'destructive',
        });
      }
    },
    [sessionId, selectedPath, toast, loadFiles],
  );

  const navigateUp = useCallback(() => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadFiles(parent);
  }, [currentPath, loadFiles]);

  return {
    files,
    loading,
    error,
    currentPath,
    selectedPath,
    fileContent,
    setFileContent,
    hasChanges,
    saving,
    loadingFile,
    loadFiles: () => loadFiles(currentPath),
    handleSelectFile,
    saveFile,
    handleDelete,
    navigateUp,
  };
}
