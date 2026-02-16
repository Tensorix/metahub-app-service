import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/knowledgeApi';

interface NumberCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

export function NumberCell({ value, field: _field, onSave }: NumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = draft === '' ? null : Number(draft);
    if (parsed !== value && (draft === '' || !Number.isNaN(parsed))) onSave(parsed);
  };

  if (!editing) {
    return (
      <div
        className="px-2 py-1 text-xs min-h-[28px] cursor-text truncate flex items-center"
        onDoubleClick={() => setEditing(true)}
        onClick={() => setEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
      >
        {value !== null && value !== undefined && value !== ''
          ? String(value)
          : <span className="text-muted-foreground">-</span>}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(value === null || value === undefined ? '' : String(value));
          setEditing(false);
        }
      }}
      className={cn(
        'h-7 text-xs border-none shadow-none rounded-none focus-visible:ring-1 px-2',
        'min-w-0'
      )}
    />
  );
}
