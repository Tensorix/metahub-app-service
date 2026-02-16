import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
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

interface MultiSelectCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

export function MultiSelectCell({ value, field, onSave }: MultiSelectCellProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const options = field.options ?? [];

  const selected = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];

  const filteredOptions = useMemo(() => {
    if (!filter.trim()) return options;
    const q = filter.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, filter]);

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onSave(next);
  };

  const remove = (opt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSave(selected.filter((s) => s !== opt));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
          className={cn(
            'w-full min-h-[28px] px-2 py-1 text-xs text-left flex items-center gap-1 flex-wrap',
            'border-none bg-transparent cursor-pointer hover:bg-accent/50 rounded',
            'focus:outline-none focus:ring-1 focus:ring-ring min-w-0'
          )}
        >
          {selected.length > 0 ? (
            selected.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className={cn(
                  'font-normal text-xs py-0 pr-1 gap-0.5',
                  getOptionColor(options.indexOf(s))
                )}
              >
                <span className="truncate max-w-[80px]">{s}</span>
                <button
                  type="button"
                  onClick={(e) => remove(s, e)}
                  className="hover:bg-black/10 rounded p-0.5"
                  aria-label="移除"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))
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
          {filteredOptions.map((opt) => (
            <label
              key={opt}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-accent/50'
              )}
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <Badge variant="outline" className={cn('font-normal text-xs', getOptionColor(options.indexOf(opt)))}>
                {opt}
              </Badge>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
