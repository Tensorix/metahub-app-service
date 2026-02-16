/**
 * File tree with DndContext for drag-move.
 */

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { FileTreeNode } from './FileTreeNode';
import type { FileTreeNode as FileTreeNodeType } from '@/lib/filesystemApi';
import type { InlineCreateState, InlineRenameState } from './useFileExplorer';

interface FileTreeProps {
  tree: FileTreeNodeType[];
  loading: boolean;
  error: string | null;
  expandedFolders: Set<string>;
  selectedPath: string | null;
  inlineCreate: InlineCreateState | null;
  inlineCreateValue: string;
  setInlineCreateValue: (v: string) => void;
  inlineRename: InlineRenameState | null;
  onToggle: (path: string) => void;
  onSelect: (path: string, readonly: boolean) => void;
  onDelete: (path: string, isDir: boolean) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onMove: (source: string, dest: string) => void;
  onUpload: (parentPath: string) => void;
  onCopyPath: (path: string) => void;
  setInlineCreate: (state: InlineCreateState | null) => void;
  setInlineRename: (state: InlineRenameState | null) => void;
  createFileAtPath: (path: string) => Promise<void>;
  createFolderAtPath: (path: string) => Promise<void>;
  setDropTarget: (dir: string | null) => void;
}

export function FileTree({
  tree,
  loading,
  error,
  expandedFolders,
  selectedPath,
  inlineCreate,
  inlineCreateValue,
  setInlineCreateValue,
  inlineRename,
  onToggle,
  onSelect,
  onDelete,
  onNewFile,
  onNewFolder,
  onRename,
  onMove,
  onUpload,
  onCopyPath,
  setInlineCreate,
  setInlineRename,
  createFileAtPath,
  createFolderAtPath,
  setDropTarget,
}: FileTreeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sourcePath = String(active.id);
    const destPath = String(over.id);
    const overData = over.data.current as { path: string; isDir: boolean } | undefined;
    if (!overData?.isDir) return;
    if (destPath.startsWith(sourcePath + '/')) return;
    const basename = sourcePath.split('/').filter(Boolean).pop() ?? '';
    const destFull = destPath === '/' || destPath.endsWith('/') ? `${destPath}${basename}` : `${destPath}/${basename}`;
    onMove(sourcePath, destFull);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }
  if (tree.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        暂无文件
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <ScrollArea className="h-full">
        <div className="py-1">
          {tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              isExpanded={expandedFolders.has(node.path)}
              isSelected={selectedPath === node.path}
              expandedFolders={expandedFolders}
              selectedPath={selectedPath}
              inlineCreate={inlineCreate}
              inlineCreateValue={inlineCreateValue}
              setInlineCreateValue={setInlineCreateValue}
              inlineRename={inlineRename}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onMove={onMove}
              onUpload={onUpload}
              onCopyPath={onCopyPath}
              setInlineCreate={setInlineCreate}
              setInlineRename={setInlineRename}
              createFileAtPath={createFileAtPath}
              createFolderAtPath={createFolderAtPath}
              setDropTarget={setDropTarget}
            />
          ))}
        </div>
      </ScrollArea>
    </DndContext>
  );
}
