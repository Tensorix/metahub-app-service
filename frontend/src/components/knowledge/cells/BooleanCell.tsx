import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { FieldDefinition } from '@/lib/knowledgeApi';

interface BooleanCellProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

export function BooleanCell({ value, field: _field, onSave }: BooleanCellProps) {
  const checked = value === true;

  return (
    <div className="flex items-center justify-center min-h-[28px] px-2 py-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(checked) => onSave(checked === true)}
        className={cn('h-4 w-4')}
      />
    </div>
  );
}
