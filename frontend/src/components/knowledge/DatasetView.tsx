import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Loader2, GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { KnowledgeNode, DatasetRow, FieldDefinition } from '@/lib/knowledgeApi';
import { CellRenderer } from './cells';
import { AddColumnDialog } from './AddColumnDialog';
import { ColumnHeaderMenu } from './ColumnHeaderMenu';
import { RowContextMenu } from './RowContextMenu';

interface DatasetViewProps {
  node: KnowledgeNode;
  onUpdate: () => void;
}

function SortableRow({
  row,
  renderCells,
}: {
  row: Row<DatasetRow>;
  renderCells: (dragHandleProps: {
    attributes: object;
    listeners?: object;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.original.id });

  const innerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={innerStyle}
      className={`group hover:bg-accent/30 transition-colors ${isDragging ? 'opacity-50 bg-accent/50' : ''}`}
    >
      {renderCells({ attributes, listeners })}
    </tr>
  );
}

export function DatasetView({ node, onUpdate }: DatasetViewProps) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const [editColField, setEditColField] = useState<FieldDefinition | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const schema = node.schema_definition;
  const fields: FieldDefinition[] = schema?.fields || [];

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await knowledgeApi.listRows(node.id, { page: 1, size: 500 });
      setRows(res.items);
    } catch {
      toastRef.current({ title: '加载失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [node.id]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const handleCellSave = async (rowId: string, fieldName: string, val: unknown) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const newData = { ...row.data, [fieldName]: val };
    try {
      await knowledgeApi.updateRow(node.id, rowId, { data: newData });
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, data: newData } : r))
      );
    } catch {
      toast({ title: '更新失败', variant: 'destructive' });
    }
  };

  const handleAddRow = useCallback(async () => {
    try {
      const newRow = await knowledgeApi.createRow(node.id, { data: {} });
      setRows((prev) => [...prev, newRow]);
      setTimeout(() => {
        tableContainerRef.current?.scrollTo({
          top: tableContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    } catch {
      toast({ title: '添加失败', variant: 'destructive' });
    }
  }, [node.id, toast]);

  const handleInsertRow = useCallback(
    async (atIndex: number, above: boolean) => {
      const insertIdx = above ? atIndex : atIndex + 1;
      try {
        const newRow = await knowledgeApi.createRow(node.id, { data: {} });
        const reordered = [
          ...rows.slice(0, insertIdx),
          newRow,
          ...rows.slice(insertIdx),
        ];
        const updates = reordered.map((r, i) => ({ id: r.id, position: i }));
        await knowledgeApi.batchUpdateRows(node.id, updates);
        setRows(reordered);
      } catch {
        toast({ title: '插入失败', variant: 'destructive' });
      }
    },
    [node.id, rows, toast]
  );

  const handleMoveRow = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const reordered = arrayMove(rows, fromIndex, toIndex);
      const updates = reordered.map((r, i) => ({ id: r.id, position: i }));
      try {
        await knowledgeApi.batchUpdateRows(node.id, updates);
        setRows(reordered);
      } catch {
        toast({ title: '移动失败', variant: 'destructive' });
      }
    },
    [node.id, rows, toast]
  );

  const handleDeleteRow = useCallback(
    async (rowId: string) => {
      try {
        await knowledgeApi.deleteRow(node.id, rowId);
        setRows((prev) => prev.filter((r) => r.id !== rowId));
      } catch {
        toast({ title: '删除失败', variant: 'destructive' });
      }
    },
    [node.id, toast]
  );

  const handleAddColumn = useCallback(
    async (field: FieldDefinition) => {
      try {
        await knowledgeApi.addColumn(node.id, field);
        setAddColOpen(false);
        onUpdate();
      } catch (err) {
        toast({
          title: '添加列失败',
          description: err instanceof Error ? err.message : '未知错误',
          variant: 'destructive',
        });
      }
    },
    [node.id, onUpdate, toast]
  );

  const handleUpdateColumn = useCallback(
    async (colName: string, updates: Partial<FieldDefinition>) => {
      try {
        await knowledgeApi.updateColumn(node.id, colName, updates);
        setEditColField(null);
        onUpdate();
      } catch (err) {
        toast({
          title: '更新列失败',
          description: err instanceof Error ? err.message : '未知错误',
          variant: 'destructive',
        });
      }
    },
    [node.id, onUpdate, toast]
  );

  const handleDeleteColumn = useCallback(
    async (colName: string) => {
      try {
        await knowledgeApi.deleteColumn(node.id, colName);
        onUpdate();
      } catch {
        toast({ title: '删除列失败', variant: 'destructive' });
      }
    },
    [node.id, onUpdate, toast]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIdx = rows.findIndex((r) => r.id === active.id);
      const toIdx = rows.findIndex((r) => r.id === over.id);
      if (fromIdx >= 0 && toIdx >= 0) handleMoveRow(fromIdx, toIdx);
    },
    [rows, handleMoveRow]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const rowIds = rows.map((r) => r.id);

  const columns: ColumnDef<DatasetRow>[] = [
    {
      id: '_row_num',
      header: '#',
      size: 48,
      minSize: 40,
      maxSize: 60,
      enableResizing: false,
      cell: () => null,
    },
    ...fields.map(
      (field): ColumnDef<DatasetRow> => ({
        id: field.name,
        size: field.width || 150,
        minSize: 60,
        maxSize: 600,
        enableResizing: true,
        header: () => (
          <div className="flex items-center gap-1 group/header">
            <span className="text-xs font-medium">{field.name}</span>
            <span className="text-[10px] text-muted-foreground">{field.type}</span>
            <ColumnHeaderMenu
              field={field}
              onEdit={() => setEditColField(field)}
              onDelete={() => handleDeleteColumn(field.name)}
            />
          </div>
        ),
        cell: ({ row }) => (
          <CellRenderer
            value={row.original.data[field.name]}
            field={field}
            onSave={(val: unknown) => handleCellSave(row.original.id, field.name, val)}
          />
        ),
      })
    ),
    {
      id: '_actions',
      header: '',
      size: 40,
      minSize: 40,
      maxSize: 60,
      enableResizing: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={() => handleDeleteRow(row.original.id)}
        >
          <Trash2 className="w-3 h-3 text-destructive" />
        </Button>
      ),
    },
    {
      id: '_add_col',
      header: () => (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => setAddColOpen(true)}
          title="添加列"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      ),
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableResizing: false,
      cell: () => null,
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 60,
      maxSize: 600,
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{node.name}</h2>
          <span className="text-xs text-muted-foreground">
            {rows.length} 行 · {fields.length} 列
          </span>
        </div>
      </div>

      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <table
              className="w-full text-sm table-fixed"
              style={{ minWidth: table.getTotalSize() }}
            >
              <colgroup>
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <col key={header.id} style={{ width: header.getSize() }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left px-2 py-1.5 border-b border-r last:border-r-0 font-normal relative select-none"
                        style={{ width: header.getSize(), minWidth: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className="absolute right-0 top-0 h-full w-1.5 -mr-0.5 cursor-col-resize touch-none hover:bg-primary/30 active:bg-primary/40 rounded"
                            style={{ userSelect: 'none' }}
                            aria-label="调节列宽"
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                <SortableContext
                  items={rowIds}
                  strategy={verticalListSortingStrategy}
                >
                  {table.getRowModel().rows.map((row) => (
                    <RowContextMenu
                      key={row.original.id}
                      rowIndex={row.index}
                      totalRows={rows.length}
                      onInsertAbove={() => handleInsertRow(row.index, true)}
                      onInsertBelow={() => handleInsertRow(row.index, false)}
                      onMoveToTop={() => handleMoveRow(row.index, 0)}
                      onMoveUp={() => handleMoveRow(row.index, row.index - 1)}
                      onMoveDown={() => handleMoveRow(row.index, row.index + 1)}
                      onMoveToBottom={() =>
                        handleMoveRow(row.index, rows.length - 1)
                      }
                      onDelete={() => handleDeleteRow(row.original.id)}
                    >
                      <SortableRow
                        row={row}
                        renderCells={({ attributes, listeners }) => (
                          <>
                            <td
                              className="border-b border-r p-0"
                              style={{ width: 48 }}
                            >
                              <div className="flex items-center gap-0.5 px-1">
                                <span
                                  {...(attributes as Record<string, unknown>)}
                                  {...((listeners ?? {}) as Record<string, unknown>)}
                                  className="cursor-grab active:cursor-grabbing touch-none p-1 rounded hover:bg-accent/50 text-muted-foreground"
                                  tabIndex={0}
                                  role="button"
                                  aria-label="拖拽排序"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {row.index + 1}
                                </span>
                              </div>
                            </td>
                            {row.getVisibleCells().map((cell) => {
                              if (cell.column.id === '_row_num') return null;
                              return (
                                <td
                                  key={cell.id}
                                  className="border-b border-r last:border-r-0 p-0"
                                  style={{ width: cell.column.getSize() }}
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )}
                                </td>
                              );
                            })}
                          </>
                        )}
                      />
                    </RowContextMenu>
                  ))}
                </SortableContext>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="text-center py-8 text-muted-foreground"
                    >
                      暂无数据，点击下方 + 添加行 开始
                    </td>
                  </tr>
                )}
                <tr className="hover:bg-transparent">
                  <td
                    colSpan={columns.length}
                    className="border-b-0 px-1 py-1"
                  >
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                      onClick={handleAddRow}
                    >
                      <Plus className="w-3 h-3" /> 添加行
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </DndContext>
        )}
      </div>

      <AddColumnDialog
        open={addColOpen}
        onOpenChange={setAddColOpen}
        onSubmit={handleAddColumn}
        title="添加列"
      />

      <AddColumnDialog
        open={!!editColField}
        onOpenChange={(open) => !open && setEditColField(null)}
        onSubmit={(field) =>
          editColField &&
          handleUpdateColumn(editColField.name, {
            type: field.type,
            description: field.description,
            required: field.required,
            options: field.options,
            default: field.default,
            width: field.width,
          })
        }
        initialField={editColField ?? undefined}
        title="编辑列"
      />
    </div>
  );
}
