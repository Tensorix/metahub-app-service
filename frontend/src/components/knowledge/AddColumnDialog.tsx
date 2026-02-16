import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { FieldDefinition } from '@/lib/knowledgeApi';

const FIELD_TYPES: FieldDefinition['type'][] = [
  'text',
  'number',
  'date',
  'datetime',
  'boolean',
  'select',
  'multi_select',
  'url',
];

const FIELD_TYPE_LABELS: Record<FieldDefinition['type'], string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  datetime: '日期时间',
  boolean: '布尔',
  select: '单选',
  multi_select: '多选',
  url: '链接',
};

export interface AddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (field: FieldDefinition) => void;
  /** When editing, pass the existing field */
  initialField?: Partial<FieldDefinition> | null;
  title?: string;
}

export function AddColumnDialog({
  open,
  onOpenChange,
  onSubmit,
  initialField = null,
  title = '添加列',
}: AddColumnDialogProps) {
  const isEdit = !!initialField?.name;
  const [name, setName] = useState(initialField?.name ?? '');
  const [type, setType] = useState<FieldDefinition['type']>(
    (initialField?.type as FieldDefinition['type']) ?? 'text'
  );
  const [description, setDescription] = useState(initialField?.description ?? '');
  const [required, setRequired] = useState(initialField?.required ?? false);
  const [options, setOptions] = useState<string[]>(initialField?.options ?? []);
  const [optionInput, setOptionInput] = useState('');
  const [defaultValue, setDefaultValue] = useState<string>('');

  useEffect(() => {
    if (open) {
      setName(initialField?.name ?? '');
      setType((initialField?.type as FieldDefinition['type']) ?? 'text');
      setDescription(initialField?.description ?? '');
      setRequired(initialField?.required ?? false);
      setOptions(initialField?.options ?? []);
      if (initialField?.default != null) {
        const d = initialField.default;
        setDefaultValue(
          Array.isArray(d) ? JSON.stringify(d) : String(d)
        );
      } else {
        setDefaultValue('');
      }
    }
  }, [open, initialField]);

  const showOptions = type === 'select' || type === 'multi_select';
  const showDefaultForType =
    type === 'boolean' ||
    type === 'select' ||
    type === 'multi_select' ||
    type === 'number' ||
    type === 'text' ||
    type === 'url';

  const addOption = () => {
    const v = optionInput.trim();
    if (v && !options.includes(v)) {
      setOptions((prev) => [...prev, v]);
      setOptionInput('');
    }
  };

  const removeOption = (idx: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let defaultVal: unknown = undefined;
    if (defaultValue.trim() && showDefaultForType) {
      if (type === 'number') {
        const n = Number(defaultValue);
        defaultVal = Number.isNaN(n) ? undefined : n;
      } else if (type === 'boolean') {
        defaultVal = defaultValue.toLowerCase() === 'true' || defaultValue === '1';
      } else if (type === 'multi_select') {
        try {
          defaultVal = JSON.parse(defaultValue) as string[];
        } catch {
          defaultVal = defaultValue.split(',').map((s) => s.trim()).filter(Boolean);
        }
      } else {
        defaultVal = defaultValue.trim();
      }
    }

    const field: FieldDefinition = {
      name: trimmedName,
      type,
      required,
      description: description.trim() || undefined,
      options: showOptions && options.length > 0 ? options : undefined,
      default: defaultVal,
    };
    onSubmit(field);
    onOpenChange(false);
    // Reset
    if (!isEdit) {
      setName('');
      setType('text');
      setDescription('');
      setRequired(false);
      setOptions([]);
      setOptionInput('');
      setDefaultValue('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>列名</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="列名称"
              disabled={isEdit}
            />
          </div>
          <div className="space-y-1">
            <Label>类型</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as FieldDefinition['type'])}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="required"
                checked={required}
                onCheckedChange={(c) => setRequired(c === true)}
              />
              <Label htmlFor="required">必填</Label>
            </div>
          </div>
          <div className="space-y-1">
            <Label>描述（可选）</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="列描述"
            />
          </div>
          {showOptions && (
            <div className="space-y-1">
              <Label>选项</Label>
              <div className="flex gap-1">
                <Input
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder="添加选项..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                />
                <Button type="button" variant="outline" size="icon" onClick={addOption}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {options.map((opt, idx) => (
                  <span
                    key={opt}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-muted text-xs"
                  >
                    {opt}
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="hover:text-destructive p-0.5"
                      aria-label="删除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {showDefaultForType && (
            <div className="space-y-1">
              <Label>默认值（可选）</Label>
              <Input
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder={
                  type === 'boolean'
                    ? 'true / false'
                    : type === 'multi_select'
                      ? 'JSON 数组，如 ["a","b"]'
                      : type === 'number'
                        ? '数字'
                        : '默认值'
                }
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {isEdit ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
