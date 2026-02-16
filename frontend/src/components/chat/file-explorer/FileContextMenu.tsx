/**
 * Context menu for file tree: file, folder, or blank area.
 */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { FilePlus, FolderPlus, Pencil, Trash2, Upload, Copy } from 'lucide-react';

interface FileContextMenuProps {
  type: 'file' | 'folder' | 'blank';
  path?: string;
  parentPath?: string;
  readonly?: boolean;
  children: React.ReactNode;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string, isDir: boolean) => void;
  onUpload: (parentPath: string) => void;
  onCopyPath: (path: string) => void;
}

const BLANK_PARENT = '/workspace';

export function FileContextMenu({
  type,
  path = '',
  parentPath = BLANK_PARENT,
  readonly = false,
  children,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onUpload,
  onCopyPath,
}: FileContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {type === 'folder' && (
          <>
            <ContextMenuItem onClick={() => onNewFile(path)}>
              <FilePlus className="h-4 w-4 mr-2" />
              新建文件
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onNewFolder(path)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              新建文件夹
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {type === 'blank' && (
          <>
            <ContextMenuItem onClick={() => onNewFile(parentPath)}>
              <FilePlus className="h-4 w-4 mr-2" />
              新建文件
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onNewFolder(parentPath)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              新建文件夹
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onUpload(parentPath)}>
              <Upload className="h-4 w-4 mr-2" />
              上传文件
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {type !== 'blank' && (
          <>
            {!readonly && (
              <ContextMenuItem onClick={() => onRename(path)}>
                <Pencil className="h-4 w-4 mr-2" />
                重命名
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => path && onCopyPath(path)}>
              <Copy className="h-4 w-4 mr-2" />
              复制路径
            </ContextMenuItem>
            {!readonly && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(path, type === 'folder')}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {type === 'folder' ? '删除文件夹' : '删除'}
                </ContextMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
