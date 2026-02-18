import { useState, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  Table2,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  MoreHorizontal,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import type { NodeTreeItem, NodeType } from '@/lib/knowledgeApi';

interface KnowledgeTreeProps {
  items: NodeTreeItem[];
  selectedId: string | null;
  onSelect: (node: NodeTreeItem) => void;
  onCreate: (parentId: string | null, type: NodeType) => void;
  onRename: (node: NodeTreeItem, newName: string) => void;
  onDelete: (node: NodeTreeItem) => void;
  onToggleVector: (node: NodeTreeItem) => void;
  /** 移动端：打开文件夹高级设置（向量化配置等） */
  onOpenFolderSettings?: (node: NodeTreeItem) => void;
}

const NODE_ICONS: Record<string, typeof Folder> = {
  folder: Folder,
  document: FileText,
  dataset: Table2,
};

function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  toggleExpand,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onToggleVector,
  onOpenFolderSettings,
  isMobile,
}: {
  node: NodeTreeItem;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (node: NodeTreeItem) => void;
  onCreate: (parentId: string | null, type: NodeType) => void;
  onRename: (node: NodeTreeItem, newName: string) => void;
  onDelete: (node: NodeTreeItem) => void;
  onToggleVector: (node: NodeTreeItem) => void;
  onOpenFolderSettings?: (node: NodeTreeItem) => void;
  isMobile: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const isFolder = node.node_type === 'folder';

  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const Icon = isFolder ? FolderIcon : NODE_ICONS[node.node_type] || FileText;

  const handleClick = () => {
    if (isFolder) {
      toggleExpand(node.id);
    }
    onSelect(node);
  };

  const startRename = () => {
    setRenameValue(node.name);
    setRenaming(true);
  };

  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== node.name) {
      onRename(node, renameValue.trim());
    }
    setRenaming(false);
  };

  const contextMenuContent = (
    <>
      {isFolder && (
        <>
          <ContextMenuItem onClick={() => onCreate(node.id, 'folder')}>
            <Folder className="w-4 h-4 mr-2" /> 新建文件夹
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCreate(node.id, 'document')}>
            <FileText className="w-4 h-4 mr-2" /> 新建文档
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCreate(node.id, 'dataset')}>
            <Table2 className="w-4 h-4 mr-2" /> 新建表格
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onToggleVector(node)}>
            <Sparkles className="w-4 h-4 mr-2" />
            {node.vector_enabled ? '关闭向量化' : '开启向量化'}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={startRename}>
        <Pencil className="w-4 h-4 mr-2" /> 重命名
      </ContextMenuItem>
      <ContextMenuItem className="text-destructive" onClick={() => onDelete(node)}>
        <Trash2 className="w-4 h-4 mr-2" /> 删除
      </ContextMenuItem>
    </>
  );

  const dropdownMenuContent = (
    <>
      {isFolder && (
        <>
          <DropdownMenuItem onClick={() => onCreate(node.id, 'folder')}>
            <Folder className="w-4 h-4 mr-2" /> 新建文件夹
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCreate(node.id, 'document')}>
            <FileText className="w-4 h-4 mr-2" /> 新建文档
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCreate(node.id, 'dataset')}>
            <Table2 className="w-4 h-4 mr-2" /> 新建表格
          </DropdownMenuItem>
          <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onToggleVector(node)}>
        <Sparkles className="w-4 h-4 mr-2" />
        {node.vector_enabled ? '关闭向量化' : '开启向量化'}
      </DropdownMenuItem>
      {onOpenFolderSettings && (
        <DropdownMenuItem onClick={() => onOpenFolderSettings(node)}>
          <Settings2 className="w-4 h-4 mr-2" />
          高级设置
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={startRename}>
        <Pencil className="w-4 h-4 mr-2" /> 重命名
      </DropdownMenuItem>
      <DropdownMenuItem className="text-destructive" onClick={() => onDelete(node)}>
        <Trash2 className="w-4 h-4 mr-2" /> 删除
      </DropdownMenuItem>
    </>
  );

  const rowContent = (
    <div
      className={cn(
        'group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm select-none',
        'hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent text-accent-foreground'
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={handleClick}
    >
      <span
        className="w-4 h-4 flex items-center justify-center shrink-0 touch-manipulation"
        onClick={
          isFolder
            ? (e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }
            : undefined
        }
        role={isFolder ? 'button' : undefined}
        aria-label={isFolder ? (isExpanded ? '折叠' : '展开') : undefined}
      >
        {isFolder ? (
          isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )
        ) : null}
      </span>
      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      {renaming ? (
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          autoFocus
          className="h-6 text-sm px-1 py-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate flex-1">{node.icon ? `${node.icon} ` : ''}{node.name}</span>
      )}
      {node.vector_enabled && (
        <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
      )}
      {isMobile && (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 shrink-0 -mr-1 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
              aria-label="更多操作"
            >
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dropdownMenuContent}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  return (
    <>
      {isMobile ? (
        rowContent
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
          <ContextMenuContent>{contextMenuContent}</ContextMenuContent>
        </ContextMenu>
      )}

      {isFolder && isExpanded && node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              onToggleVector={onToggleVector}
              onOpenFolderSettings={onOpenFolderSettings}
              isMobile={isMobile}
            />
      ))}
    </>
  );
}

export function KnowledgeTree({
  items,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onToggleVector,
  onOpenFolderSettings,
}: KnowledgeTreeProps) {
  const { isMobile } = useBreakpoints();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">知识库</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground',
              isMobile ? 'h-11 min-h-11 w-11 min-w-11' : 'h-7 w-7'
            )}
          >
            <Plus className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCreate(null, 'folder')}>
              <Folder className="w-4 h-4 mr-2" /> 新建文件夹
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreate(null, 'document')}>
              <FileText className="w-4 h-4 mr-2" /> 新建文档
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreate(null, 'dataset')}>
              <Table2 className="w-4 h-4 mr-2" /> 新建表格
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 px-4">
            <Folder className="w-8 h-8" />
            <p>知识库为空</p>
            <Button variant="outline" size="sm" onClick={() => onCreate(null, 'folder')}>
              创建文件夹
            </Button>
          </div>
        ) : (
          items.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              onToggleVector={onToggleVector}
              onOpenFolderSettings={onOpenFolderSettings}
              isMobile={isMobile}
            />
          ))
        )}
      </div>
    </div>
  );
}
