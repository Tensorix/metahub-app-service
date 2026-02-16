import type { FieldDefinition } from '@/lib/knowledgeApi';
import { TextCell } from './TextCell';
import { NumberCell } from './NumberCell';
import { BooleanCell } from './BooleanCell';
import { SelectCell } from './SelectCell';
import { MultiSelectCell } from './MultiSelectCell';
import { DateTimeCell } from './DateTimeCell';
import { URLCell } from './URLCell';

export { TextCell, NumberCell, BooleanCell, SelectCell, MultiSelectCell, DateTimeCell, URLCell };

export interface CellRendererProps {
  value: unknown;
  field: FieldDefinition;
  onSave: (val: unknown) => void;
}

export function CellRenderer({ value, field, onSave }: CellRendererProps) {
  switch (field.type) {
    case 'text':
      return <TextCell value={value} field={field} onSave={onSave} />;
    case 'number':
      return <NumberCell value={value} field={field} onSave={onSave} />;
    case 'boolean':
      return <BooleanCell value={value} field={field} onSave={onSave} />;
    case 'select':
      return <SelectCell value={value} field={field} onSave={onSave} />;
    case 'multi_select':
      return <MultiSelectCell value={value} field={field} onSave={onSave} />;
    case 'date':
    case 'datetime':
      return <DateTimeCell value={value} field={field} onSave={onSave} />;
    case 'url':
      return <URLCell value={value} field={field} onSave={onSave} />;
    default:
      return <TextCell value={value} field={field} onSave={onSave} />;
  }
}
