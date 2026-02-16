import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FieldDefinition } from '@/lib/knowledgeApi';

export interface ColumnHeaderMenuProps {
  field: FieldDefinition;
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}

export function ColumnHeaderMenu({
  field: _field,
  onEdit,
  onDelete,
  children,
}: ColumnHeaderMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {children ?? (
          <span className="inline-flex size-6 items-center justify-center rounded hover:bg-accent cursor-pointer">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 mr-2" />
          编辑列
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          删除列
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
