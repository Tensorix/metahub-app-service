import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/knowledgeApi';

interface DateTimeCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';

function parseValue(val: unknown): Date | undefined {
  if (val == null || val === '') return undefined;
  const d = dayjs(val as string | Date);
  return d.isValid() ? d.toDate() : undefined;
}

function formatValue(val: unknown, isDateTime: boolean): string {
  const d = parseValue(val);
  if (!d) return '';
  return dayjs(d).format(isDateTime ? DATETIME_FORMAT : DATE_FORMAT);
}

export function DateTimeCell({ value, field, onSave }: DateTimeCellProps) {
  const [open, setOpen] = useState(false);
  const isDateTime = field.type === 'datetime';

  const date = parseValue(value);
  const [timeStr, setTimeStr] = useState('00:00');

  useEffect(() => {
    const d = parseValue(value);
    setTimeStr(d ? dayjs(d).format('HH:mm') : '00:00');
  }, [value]);

  const displayText = formatValue(value, isDateTime);

  const handleSelect = (d: Date | undefined) => {
    if (!d) {
      onSave(null);
      setOpen(false);
      return;
    }
    if (isDateTime) {
      const [h, m] = timeStr.split(':').map(Number);
      const merged = dayjs(d).hour(h || 0).minute(m || 0);
      onSave(merged.format('YYYY-MM-DDTHH:mm:ss'));
    } else {
      onSave(dayjs(d).format('YYYY-MM-DD'));
      setOpen(false);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTimeStr(v);
    if (date) {
      const [h, m] = v.split(':').map(Number);
      const merged = dayjs(date).hour(h || 0).minute(m || 0);
      onSave(merged.format('YYYY-MM-DDTHH:mm:ss'));
    }
  };

  const handleClear = () => {
    onSave(null);
    setOpen(false);
  };

  const initialDate = date ?? new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}
          className={cn(
            'w-full min-h-[28px] px-2 py-1 text-xs text-left truncate flex items-center gap-1',
            'border-none bg-transparent cursor-pointer hover:bg-accent/50 rounded',
            'focus:outline-none focus:ring-1 focus:ring-ring'
          )}
        >
          {displayText ? (
            <>
              <CalendarIcon className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="truncate">{displayText}</span>
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={date}
          onSelect={handleSelect}
          defaultMonth={initialDate}
          startMonth={new Date(1970, 0)}
          endMonth={new Date(2050, 11)}
        />
        {isDateTime && (
          <div className="flex items-center gap-2 px-3 pb-2 border-t pt-2">
            <span className="text-xs text-muted-foreground shrink-0">时间</span>
            <Input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              className="h-7 text-xs flex-1"
            />
          </div>
        )}
        {date && (
          <div className="px-3 pb-3 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={handleClear}
            >
              清除
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
