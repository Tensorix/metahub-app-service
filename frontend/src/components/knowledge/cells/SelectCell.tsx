import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/knowledgeApi';

const OPTION_COLORS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300/50',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300/50',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/50',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300/50',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-300/50',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-300/50',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-300/50',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-300/50',
];

function getOptionColor(index: number) {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

interface SelectCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

export function SelectCell({ value, field, onSave }: SelectCellProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const options = field.options ?? [];

  const filteredOptions = useMemo(() => {
    if (!filter.trim()) return options;
    const q = filter.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, filter]);

  const selectedLabel = value != null && value !== '' ? String(value) : null;
  const colorClass = selectedLabel != null
    ? getOptionColor(options.indexOf(selectedLabel))
    : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
          className={cn(
            'w-full min-h-[28px] px-2 py-1 text-xs text-left truncate flex items-center',
            'border-none bg-transparent cursor-pointer hover:bg-accent/50 rounded',
            'focus:outline-none focus:ring-1 focus:ring-ring'
          )}
        >
          {selectedLabel ? (
            <Badge variant="outline" className={cn('font-normal text-xs', colorClass)}>
              {selectedLabel}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-[12rem] p-2">
        {options.length > 5 && (
          <Input
            placeholder="搜索..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 text-xs mb-2"
            autoFocus
          />
        )}
        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
          <button
            type="button"
            className={cn(
              'w-full text-left px-2 py-1.5 text-xs rounded',
              !selectedLabel && 'bg-accent'
            )}
            onClick={() => {
              onSave(null);
              setOpen(false);
            }}
          >
            <span className="text-muted-foreground">-</span>
          </button>
          {filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className={cn(
                'w-full text-left px-2 py-1.5 text-xs rounded flex items-center',
                selectedLabel === opt && 'bg-accent'
              )}
              onClick={() => {
                onSave(opt);
                setOpen(false);
              }}
            >
              <Badge variant="outline" className={cn('font-normal text-xs', getOptionColor(options.indexOf(opt)))}>
                {opt}
              </Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
