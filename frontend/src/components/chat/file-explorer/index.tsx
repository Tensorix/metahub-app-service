/**
 * FileExplorer - browse, edit, upload, move files in session filesystem.
 * Supports a Store / Sandbox tab switcher when a sandbox is active.
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Plus, X, ChevronUp, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useChatStore } from '@/store/chat';
import { sandboxApi } from '@/lib/api';
import { FileTree } from './FileTree';
import { FileEditor } from './FileEditor';
import { DropZone } from './DropZone';
import { FileContextMenu } from './FileContextMenu';
import { useFileExplorer } from './useFileExplorer';
import { useSandboxFileExplorer } from './useSandboxFileExplorer';

interface FileExplorerProps {
  sessionId: string;
  topicId?: string;
  className?: string;
  onClose?: () => void;
}

export function FileExplorer({ sessionId, topicId, className, onClose }: FileExplorerProps) {
  const { toast } = useToast();
  const explorer = useFileExplorer(sessionId, topicId);
  const sandboxExplorer = useSandboxFileExplorer(sessionId);

  const sandboxStatus = useChatStore((s) => s.sandboxStatus);
  const hasSandbox = sandboxStatus[sessionId]?.status === 'running';
  const [activeTab, setActiveTab] = useState<'store' | 'sandbox'>('store');
  const [transferring, setTransferring] = useState(false);

  const handleCopyPath = useCallback(
    (path: string) => {
      navigator.clipboard.writeText(path);
      toast({ title: '已复制路径', description: path });
    },
    [toast]
  );

  const handleTransferToSandbox = useCallback(
    async (path: string) => {
      setTransferring(true);
      try {
        await sandboxApi.transfer(sessionId, {
          source: 'store',
          destination: 'sandbox',
          path,
        });
        toast({ title: '已发送到沙箱', description: path });
        sandboxExplorer.loadFiles();
      } catch (err: any) {
        toast({ title: '传输失败', description: err?.response?.data?.detail || String(err), variant: 'destructive' });
      } finally {
        setTransferring(false);
      }
    },
    [sessionId, toast, sandboxExplorer],
  );

  const handleTransferToStore = useCallback(
    async (path: string) => {
      setTransferring(true);
      try {
        const destPath = `/workspace${path.startsWith('/') ? path : '/' + path}`;
        await sandboxApi.transfer(sessionId, {
          source: 'sandbox',
          destination: 'store',
          path,
          dest_path: destPath,
        });
        toast({ title: '已复制到 Store', description: destPath });
        explorer.loadFiles();
      } catch (err: any) {
        toast({ title: '传输失败', description: err?.response?.data?.detail || String(err), variant: 'destructive' });
      } finally {
        setTransferring(false);
      }
    },
    [sessionId, toast, explorer],
  );

  // ---- Sandbox tab ----
  if (activeTab === 'sandbox' && hasSandbox) {
    return (
      <div className={cn('flex flex-col h-full border-l bg-background', className)}>
        {/* Tab bar */}
        {hasSandbox && (
          <div className="flex border-b">
            <button
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium', activeTab === 'store' && 'border-b-2 border-primary')}
              onClick={() => setActiveTab('store')}
            >
              Store
            </button>
            <button
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium', activeTab === 'sandbox' && 'border-b-2 border-primary')}
              onClick={() => setActiveTab('sandbox')}
            >
              Sandbox
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            {sandboxExplorer.currentPath !== '/' && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={sandboxExplorer.navigateUp}>
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
            <span className="font-medium text-sm truncate max-w-[160px]" title={sandboxExplorer.currentPath}>
              {sandboxExplorer.currentPath}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={sandboxExplorer.loadFiles} disabled={sandboxExplorer.loading}>
              <RefreshCw className={cn('h-4 w-4', sandboxExplorer.loading && 'animate-spin')} />
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Simple file list for sandbox */}
          <div className="w-1/3 min-w-[150px] border-r overflow-y-auto">
            {sandboxExplorer.loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              </div>
            )}
            {sandboxExplorer.error && (
              <div className="p-3 text-xs text-destructive">{sandboxExplorer.error}</div>
            )}
            {!sandboxExplorer.loading && !sandboxExplorer.error && sandboxExplorer.files.map((f) => (
              <FileContextMenu
                key={f.path}
                type={f.isDir ? 'folder' : 'file'}
                path={f.path}
                onNewFile={() => {}}
                onNewFolder={() => {}}
                onRename={() => {}}
                onDelete={(p) => sandboxExplorer.handleDelete(p)}
                onUpload={() => {}}
                onCopyPath={handleCopyPath}
                onTransfer={transferring ? undefined : () => handleTransferToStore(f.path)}
                transferLabel="复制到 Store"
              >
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent',
                    sandboxExplorer.selectedPath === f.path && 'bg-accent',
                  )}
                  onClick={() => sandboxExplorer.handleSelectFile(f.path, f.isDir)}
                >
                  <span className="truncate">{f.isDir ? '📁' : '📄'} {f.name}</span>
                </div>
              </FileContextMenu>
            ))}
          </div>

          <FileEditor
            selectedPath={sandboxExplorer.selectedPath}
            readonly={false}
            content={sandboxExplorer.fileContent}
            onContentChange={sandboxExplorer.setFileContent}
            hasChanges={sandboxExplorer.hasChanges}
            saving={sandboxExplorer.saving}
            loadingFile={sandboxExplorer.loadingFile}
            onSave={sandboxExplorer.saveFile}
          />
        </div>
      </div>
    );
  }

  // ---- Store tab (default) ----
  return (
    <DropZone
      onDrop={async (files, targetDir) => {
        for (const f of files) {
          await explorer.handleUpload(f, targetDir);
        }
      }}
      defaultTargetDir="/workspace"
      dropTargetDir={explorer.uploadTargetDir}
      onDragTargetChange={explorer.setUploadTargetDir}
      className={cn('flex flex-col h-full border-l bg-background', className)}
    >
      <div className="flex flex-col h-full">
        {/* Tab bar */}
        {hasSandbox && (
          <div className="flex border-b">
            <button
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium', activeTab === 'store' && 'border-b-2 border-primary')}
              onClick={() => setActiveTab('store')}
            >
              Store
            </button>
            <button
              className={cn('flex-1 px-3 py-1.5 text-xs font-medium', activeTab === 'sandbox' && 'border-b-2 border-primary')}
              onClick={() => setActiveTab('sandbox')}
            >
              Sandbox
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-medium text-sm">文件系统</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={explorer.loadFiles} disabled={explorer.loading}>
              <RefreshCw className={cn('h-4 w-4', explorer.loading && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => explorer.setShowNewFile(true)}>
              <Plus className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {explorer.showNewFile && (
          <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
            <Input
              placeholder="/path/to/file.txt"
              value={explorer.newFilePath}
              onChange={(e) => explorer.setNewFilePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') explorer.createFileFromHeader();
                if (e.key === 'Escape') {
                  explorer.setShowNewFile(false);
                  explorer.setNewFilePath('');
                }
              }}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="sm" onClick={explorer.createFileFromHeader}>
              创建
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                explorer.setShowNewFile(false);
                explorer.setNewFilePath('');
              }}
            >
              取消
            </Button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <FileContextMenu
            type="blank"
            parentPath="/workspace"
            onNewFile={explorer.onNewFile}
            onNewFolder={explorer.onNewFolder}
            onRename={() => {}}
            onDelete={() => {}}
            onUpload={explorer.triggerUpload}
            onCopyPath={() => {}}
            onTransfer={hasSandbox && explorer.selectedPath && !transferring
              ? () => handleTransferToSandbox(explorer.selectedPath!)
              : undefined}
            transferLabel="发送到沙箱"
          >
            <div className="w-1/3 min-w-[150px] border-r flex flex-col">
              <FileTree
                tree={explorer.tree}
                loading={explorer.loading}
                error={explorer.error}
                expandedFolders={explorer.expandedFolders}
                selectedPath={explorer.selectedPath}
                inlineCreate={explorer.inlineCreate}
                inlineCreateValue={explorer.inlineCreateValue}
                setInlineCreateValue={explorer.setInlineCreateValue}
                inlineRename={explorer.inlineRename}
                onToggle={explorer.toggleFolder}
                onSelect={explorer.handleSelectFile}
                onDelete={explorer.handleDelete}
                onNewFile={explorer.onNewFile}
                onNewFolder={explorer.onNewFolder}
                onRename={(p) => explorer.setInlineRename({ path: p, name: p.split('/').filter(Boolean).pop() ?? '' })}
                onMove={explorer.handleMove}
                onUpload={explorer.triggerUpload}
                onCopyPath={handleCopyPath}
                setInlineCreate={explorer.setInlineCreate}
                setInlineRename={explorer.setInlineRename}
                createFileAtPath={explorer.createFileAtPath}
                createFolderAtPath={explorer.createFolderAtPath}
                setDropTarget={explorer.setUploadTargetDir}
              />
            </div>
          </FileContextMenu>

          <FileEditor
            selectedPath={explorer.selectedPath}
            readonly={explorer.selectedReadonly}
            content={explorer.fileContent}
            onContentChange={explorer.setFileContent}
            hasChanges={explorer.hasChanges}
            saving={explorer.saving}
            loadingFile={explorer.loadingFile}
            onSave={explorer.saveFile}
          />
        </div>
      </div>
    </DropZone>
  );
}
