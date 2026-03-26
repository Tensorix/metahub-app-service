import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/knowledgeApi';

interface URLCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

function isValidUrl(str: string): boolean {
  if (!str.trim()) return false;
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

export function URLCell({ value, field: _field, onSave }: URLCellProps) {
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
    const val = draft.trim() === '' ? null : draft.trim();
    if (val !== (value ?? '')) onSave(val);
  };

  const str = String(value ?? '');
  const isLink = isValidUrl(str);

  if (!editing) {
    return (
      <div className="flex items-center gap-1 min-h-[28px] px-2 py-1">
        <div
          className="flex-1 min-w-0 text-xs truncate cursor-text"
          onDoubleClick={() => setEditing(true)}
          onClick={() => !str && setEditing(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        >
          {str ? (
            isLink ? (
              <a
                href={str}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline truncate block"
                onClick={(e) => e.stopPropagation()}
              >
                {str}
              </a>
            ) : (
              str
            )
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
        {str && isLink && (
          <a
            href={str}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground p-1"
            title="在新窗口打开"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <Input
        ref={inputRef}
        type="url"
        placeholder="https://..."
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
          'flex-1 min-w-0'
        )}
      />
      {draft && isValidUrl(draft) && (
        <a
          href={draft}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
          title="在新窗口打开"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
