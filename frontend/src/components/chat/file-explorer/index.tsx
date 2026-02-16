/**
 * FileExplorer - browse, edit, upload, move files in session filesystem.
 */

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FileTree } from './FileTree';
import { FileEditor } from './FileEditor';
import { DropZone } from './DropZone';
import { FileContextMenu } from './FileContextMenu';
import { useFileExplorer } from './useFileExplorer';

interface FileExplorerProps {
  sessionId: string;
  topicId?: string;
  className?: string;
  onClose?: () => void;
}

export function FileExplorer({ sessionId, topicId, className, onClose }: FileExplorerProps) {
  const { toast } = useToast();
  const explorer = useFileExplorer(sessionId, topicId);

  const handleCopyPath = useCallback(
    (path: string) => {
      navigator.clipboard.writeText(path);
      toast({ title: '已复制路径', description: path });
    },
    [toast]
  );

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
