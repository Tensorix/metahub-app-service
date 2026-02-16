import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Plus, Trash2, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type {
  KnowledgeNode,
  DatasetRow,
  FieldDefinition,
} from '@/lib/knowledgeApi';

const FIELD_TYPES: FieldDefinition['type'][] = [
  'text', 'number', 'date', 'datetime', 'boolean', 'select', 'multi_select', 'url',
];

interface DatasetViewProps {
  node: KnowledgeNode;
  onUpdate: () => void;
}

function InlineCell({
  value,
  field,
  onSave,
}: {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    let parsed: unknown = draft;
    if (field.type === 'number') parsed = draft === '' ? null : Number(draft);
    else if (field.type === 'boolean') parsed = draft === 'true';
    if (parsed !== value) onSave(parsed);
  };

  if (field.type === 'boolean') {
    return (
      <Select
        value={String(value ?? '')}
        onValueChange={(v) => onSave(v === 'true')}
      >
        <SelectTrigger className="h-7 border-none shadow-none text-xs">
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">是</SelectItem>
          <SelectItem value="false">否</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'select' && field.options?.length) {
    return (
      <Select
        value={String(value ?? '')}
        onValueChange={(v) => onSave(v)}
      >
        <SelectTrigger className="h-7 border-none shadow-none text-xs">
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (!editing) {
    return (
      <div
        className="px-2 py-1 text-xs min-h-[28px] cursor-text truncate"
        onDoubleClick={() => setEditing(true)}
        onClick={() => setEditing(true)}
      >
        {String(value ?? '') || <span className="text-muted-foreground">-</span>}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(String(value ?? ''));
          setEditing(false);
        }
      }}
      className="h-7 text-xs border-none shadow-none rounded-none focus-visible:ring-1 px-2"
    />
  );
}

export function DatasetView({ node, onUpdate }: DatasetViewProps) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newCol, setNewCol] = useState<Partial<FieldDefinition>>({ name: '', type: 'text' });

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

  const handleAddRow = async () => {
    try {
      const newRow = await knowledgeApi.createRow(node.id, { data: {} });
      setRows((prev) => [...prev, newRow]);
    } catch {
      toast({ title: '添加失败', variant: 'destructive' });
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    try {
      await knowledgeApi.deleteRow(node.id, rowId);
      setRows((prev) => prev.filter((r) => r.id !== rowId));
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const handleAddColumn = async () => {
    if (!newCol.name?.trim()) return;
    try {
      await knowledgeApi.addColumn(node.id, {
        name: newCol.name.trim(),
        type: (newCol.type as FieldDefinition['type']) || 'text',
      });
      setAddColOpen(false);
      setNewCol({ name: '', type: 'text' });
      onUpdate();
    } catch (err) {
      toast({
        title: '添加列失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteColumn = async (colName: string) => {
    try {
      await knowledgeApi.deleteColumn(node.id, colName);
      onUpdate();
    } catch {
      toast({ title: '删除列失败', variant: 'destructive' });
    }
  };

  // Build table columns
  const columns: ColumnDef<DatasetRow>[] = [
    // Row number
    {
      id: '_row_num',
      header: '#',
      size: 40,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground px-2">{row.index + 1}</span>
      ),
    },
    // Data columns from schema
    ...fields.map((field): ColumnDef<DatasetRow> => ({
      id: field.name,
      header: () => (
        <div className="flex items-center gap-1 group/header">
          <span className="text-xs font-medium">{field.name}</span>
          <span className="text-[10px] text-muted-foreground">{field.type}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 opacity-0 group-hover/header:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteColumn(field.name);
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ),
      size: field.width || 150,
      cell: ({ row }) => (
        <InlineCell
          value={row.original.data[field.name]}
          field={field}
          onSave={(val) => handleCellSave(row.original.id, field.name, val)}
        />
      ),
    })),
    // Actions
    {
      id: '_actions',
      header: '',
      size: 40,
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
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{node.name}</h2>
          <span className="text-xs text-muted-foreground">
            {rows.length} 行 · {fields.length} 列
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setAddColOpen(true)}>
            <Settings className="w-3.5 h-3.5 mr-1" /> 添加列
          </Button>
          <Button size="sm" onClick={handleAddRow}>
            <Plus className="w-3.5 h-3.5 mr-1" /> 添加行
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-left px-2 py-1.5 border-b border-r last:border-r-0 font-normal"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="group hover:bg-accent/30 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="border-b border-r last:border-r-0 p-0"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="text-center py-8 text-muted-foreground"
                  >
                    暂无数据，点击"添加行"开始
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add column dialog */}
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>添加列</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>列名</Label>
              <Input
                value={newCol.name || ''}
                onChange={(e) => setNewCol({ ...newCol, name: e.target.value })}
                placeholder="列名称"
              />
            </div>
            <div className="space-y-1">
              <Label>类型</Label>
              <Select
                value={newCol.type || 'text'}
                onValueChange={(v) =>
                  setNewCol({ ...newCol, type: v as FieldDefinition['type'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddColumn} disabled={!newCol.name?.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
