import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/knowledgeApi';

interface TextCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

export function TextCell({ value, field: _field, onSave }: TextCellProps) {
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
    const val = draft === '' ? null : draft;
    if (val !== value) onSave(val);
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
        {String(value ?? '') || <span className="text-muted-foreground">-</span>}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="text"
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
      className={cn(
        'h-7 text-xs border-none shadow-none rounded-none focus-visible:ring-1 px-2',
        'min-w-0'
      )}
    />
  );
}
