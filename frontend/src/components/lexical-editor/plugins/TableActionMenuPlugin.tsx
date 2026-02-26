import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  TableCellNode,
} from '@lexical/table';
import { $getNearestNodeOfType } from '@lexical/utils';
import {
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

export function TableActionMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [tableCellNode, setTableCellNode] = useState<TableCellNode | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setTableCellNode(null);
          return false;
        }

        const node = selection.anchor.getNode();
        const cellNode = $getNearestNodeOfType(node, TableCellNode);

        if (cellNode) {
          setTableCellNode(cellNode);
        } else {
          setTableCellNode(null);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  // Close menu on click outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = () => setIsMenuOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isMenuOpen]);

  const insertRowAbove = useCallback(() => {
    editor.update(() => {
      $insertTableRow__EXPERIMENTAL(false);
    });
    setIsMenuOpen(false);
  }, [editor]);

  const insertRowBelow = useCallback(() => {
    editor.update(() => {
      $insertTableRow__EXPERIMENTAL(true);
    });
    setIsMenuOpen(false);
  }, [editor]);

  const insertColumnLeft = useCallback(() => {
    editor.update(() => {
      $insertTableColumn__EXPERIMENTAL(false);
    });
    setIsMenuOpen(false);
  }, [editor]);

  const insertColumnRight = useCallback(() => {
    editor.update(() => {
      $insertTableColumn__EXPERIMENTAL(true);
    });
    setIsMenuOpen(false);
  }, [editor]);

  const deleteRow = useCallback(() => {
    editor.update(() => {
      $deleteTableRow__EXPERIMENTAL();
    });
    setIsMenuOpen(false);
  }, [editor]);

  const deleteColumn = useCallback(() => {
    editor.update(() => {
      $deleteTableColumn__EXPERIMENTAL();
    });
    setIsMenuOpen(false);
  }, [editor]);

  const deleteTable = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const node = selection.anchor.getNode();
      const cellNode = $getNearestNodeOfType(node, TableCellNode);
      if (!cellNode) return;
      try {
        const tableNode = $getTableNodeFromLexicalNodeOrThrow(cellNode);
        tableNode.remove();
      } catch {
        // ignore
      }
    });
    setIsMenuOpen(false);
  }, [editor]);

  // Attach context menu to table cells
  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handleRootContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const cell = target.closest('td, th');
      if (cell && rootElement.contains(cell)) {
        event.preventDefault();
        setMenuPosition({
          top: event.clientY,
          left: event.clientX,
        });
        setIsMenuOpen(true);
      }
    };

    rootElement.addEventListener('contextmenu', handleRootContextMenu);
    return () => rootElement.removeEventListener('contextmenu', handleRootContextMenu);
  }, [editor]);

  if (!isMenuOpen || !tableCellNode) return null;

  return createPortal(
    <div
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem icon={<ArrowUp className="w-4 h-4" />} label="在上方插入行" onClick={insertRowAbove} />
      <MenuItem icon={<ArrowDown className="w-4 h-4" />} label="在下方插入行" onClick={insertRowBelow} />
      <MenuItem icon={<ArrowLeft className="w-4 h-4" />} label="在左侧插入列" onClick={insertColumnLeft} />
      <MenuItem icon={<ArrowRight className="w-4 h-4" />} label="在右侧插入列" onClick={insertColumnRight} />
      <div className="my-1 h-px bg-border" />
      <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除行" onClick={deleteRow} destructive />
      <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除列" onClick={deleteColumn} destructive />
      <MenuItem icon={<Trash2 className="w-4 h-4" />} label="删除表格" onClick={deleteTable} destructive />
    </div>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: JSX.Element;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent ${
        destructive ? 'text-destructive hover:text-destructive' : ''
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
