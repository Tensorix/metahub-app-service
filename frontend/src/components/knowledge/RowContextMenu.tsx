import {
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface RowContextMenuProps {
  children: React.ReactNode;
  rowIndex: number;
  totalRows: number;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onMoveToTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToBottom: () => void;
  onDelete: () => void;
}

export function RowContextMenu({
  children,
  rowIndex,
  totalRows,
  onInsertAbove,
  onInsertBelow,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onMoveToBottom,
  onDelete,
}: RowContextMenuProps) {
  const canMoveUp = rowIndex > 0;
  const canMoveDown = rowIndex < totalRows - 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onInsertAbove}>
          <Plus className="w-3.5 h-3.5 mr-2" />
          在上方插入行
        </ContextMenuItem>
        <ContextMenuItem onClick={onInsertBelow}>
          <Plus className="w-3.5 h-3.5 mr-2" />
          在下方插入行
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onMoveToTop} disabled={!canMoveUp}>
          <ArrowUpToLine className="w-3.5 h-3.5 mr-2" />
          移到顶部
        </ContextMenuItem>
        <ContextMenuItem onClick={onMoveUp} disabled={!canMoveUp}>
          <ChevronUp className="w-3.5 h-3.5 mr-2" />
          上移一行
        </ContextMenuItem>
        <ContextMenuItem onClick={onMoveDown} disabled={!canMoveDown}>
          <ChevronDown className="w-3.5 h-3.5 mr-2" />
          下移一行
        </ContextMenuItem>
        <ContextMenuItem onClick={onMoveToBottom} disabled={!canMoveDown}>
          <ArrowDownToLine className="w-3.5 h-3.5 mr-2" />
          移到底部
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          删除行
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
