/**
 * Single file/folder node with drag support and context menu.
 */

import { useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  ChevronRight,
  ChevronDown,
  Trash2,
  Plus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getLanguageFromPath } from '@/lib/filesystemApi';
import type { FileTreeNode as FileTreeNodeType } from '@/lib/filesystemApi';
import { FileContextMenu } from './FileContextMenu';
import { InlineInput } from './InlineInput';
import type { InlineCreateState, InlineRenameState } from './useFileExplorer';

function getFileIcon(path: string) {
  const lang = getLanguageFromPath(path);
  switch (lang) {
    case 'javascript':
    case 'typescript':
    case 'python':
      return <FileCode className="h-4 w-4 text-blue-500 shrink-0" />;
    case 'json':
      return <FileJson className="h-4 w-4 text-yellow-500 shrink-0" />;
    case 'markdown':
      return <FileText className="h-4 w-4 text-purple-500 shrink-0" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

interface FileTreeNodeProps {
  node: FileTreeNodeType;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
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
  setDropTarget?: (dir: string | null) => void;
}

export function FileTreeNode({
  node,
  depth,
  isExpanded,
  isSelected,
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
}: FileTreeNodeProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: node.path,
    data: { path: node.path, isDir: node.isDir },
    disabled: node.readonly,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: node.path,
    data: { path: node.path, isDir: node.isDir },
    disabled: !node.isDir,
  });

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      if (node.isDir) setDroppableRef(el);
    },
    [setNodeRef, setDroppableRef, node.isDir]
  );

  const showInlineCreate = inlineCreate?.parentPath === node.path;
  const showInlineRename = inlineRename?.path === node.path;

  const canModify = !node.readonly;

  const handleInlineCreateConfirm = useCallback(
    async (value?: string) => {
      const name = (value ?? inlineCreateValue).trim();
      if (!name || !inlineCreate) return;
      const base = inlineCreate.parentPath === '/' ? '' : inlineCreate.parentPath;
      const fullPath = base ? `${base}/${name}` : `/${name}`;
      if (inlineCreate.type === 'file') {
        await createFileAtPath(fullPath);
      } else {
        await createFolderAtPath(fullPath);
      }
      setInlineCreate(null);
      setInlineCreateValue('');
    },
    [inlineCreate, inlineCreateValue, createFileAtPath, createFolderAtPath, setInlineCreate, setInlineCreateValue]
  );

  const handleInlineRenameConfirm = useCallback(
    (value?: string) => {
      if (!inlineRename) return;
      const newName = (value ?? inlineRename.name).trim();
      if (!newName || newName === node.name) {
        setInlineRename(null);
        return;
      }
      const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) || '/' : '/';
      const destPath = parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`;
      onMove(node.path, destPath);
      setInlineRename(null);
    },
    [inlineRename, node.path, node.name, onMove, setInlineRename]
  );

  return (
    <FileContextMenu
      type={node.isDir ? 'folder' : 'file'}
      path={node.path}
      readonly={node.readonly}
      onNewFile={onNewFile}
      onNewFolder={onNewFolder}
      onRename={onRename}
      onDelete={onDelete}
      onUpload={onUpload}
      onCopyPath={onCopyPath}
    >
      <div>
        <div
          ref={setRef}
          {...(canModify && !showInlineRename ? { ...attributes, ...listeners } : {})}
          className={cn(
            'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface-hover rounded-sm group',
            isSelected && 'bg-accent',
            isOver && node.isDir && 'ring-1 ring-brand/50 bg-brand/5'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.isDir) {
              onToggle(node.path);
              setDropTarget?.(node.path);
            } else {
              onSelect(node.path, node.readonly);
            }
          }}
          onDragEnter={() => node.isDir && setDropTarget?.(node.path)}
          onDragLeave={() => setDropTarget?.(null)}
        >
          {node.isDir ? (
            <>
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              {isExpanded ? <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" /> : <Folder className="h-4 w-4 text-yellow-500 shrink-0" />}
            </>
          ) : (
            <>
              <span className="w-4" />
              {getFileIcon(node.path)}
            </>
          )}
          {showInlineRename ? (
            <InlineInput
              value={inlineRename!.name}
              onChange={(v) => setInlineRename({ ...inlineRename!, name: v })}
              onConfirm={handleInlineRenameConfirm}
              onCancel={() => setInlineRename(null)}
              type={node.isDir ? 'folder' : 'file'}
              depth={0}
              className="flex-1 min-w-0"
              showIcon={false}
            />
          ) : (
            <>
              <span className="truncate flex-1 text-sm">{node.name}</span>
              {node.readonly && !node.isDir && <span className="text-[10px] text-muted-foreground/60 shrink-0">只读</span>}
              {node.isDir && canModify && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center p-0 rounded hover:bg-accent"
                    >
                      <Plus className="h-3 w-3" />
                    </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem
                      onClick={() => {
                        setInlineCreateValue('');
                        setInlineCreate({ parentPath: node.path, type: 'file' });
                      }}
                    >
                      <File className="h-3 w-3 mr-2" />
                      新建文件
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setInlineCreateValue('');
                        setInlineCreate({ parentPath: node.path, type: 'folder' });
                      }}
                    >
                      <Folder className="h-3 w-3 mr-2" />
                      新建文件夹
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {!node.isDir && canModify && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node.path, false);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
        {node.isDir && isExpanded && (
          <div>
          {showInlineCreate && (
            <InlineInput
              value={inlineCreateValue}
              onChange={setInlineCreateValue}
              onConfirm={handleInlineCreateConfirm}
              onCancel={() => {
                setInlineCreate(null);
                setInlineCreateValue('');
              }}
              type={inlineCreate?.type ?? 'file'}
              depth={depth + 1}
            />
          )}
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isExpanded={expandedFolders.has(child.path)}
              isSelected={selectedPath === child.path}
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
        )}
      </div>
    </FileContextMenu>
  );
}
