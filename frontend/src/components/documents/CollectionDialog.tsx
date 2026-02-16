import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { documentApi } from '@/lib/documentApi';
import type {
  DocumentCollection,
  CollectionCreate,
  FieldDefinition,
} from '@/lib/documentApi';
import { Plus, Trash2 } from 'lucide-react';

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

interface CollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: DocumentCollection | null;
  onSuccess: () => void;
}

export function CollectionDialog({
  open,
  onOpenChange,
  collection,
  onSuccess,
}: CollectionDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'structured' | 'unstructured'>('unstructured');
  const [fields, setFields] = useState<FieldDefinition[]>([]);

  useEffect(() => {
    if (open) {
      if (collection) {
        setName(collection.name);
        setDescription(collection.description || '');
        setType(collection.type as 'structured' | 'unstructured');
        const schema = collection.schema_definition as { fields?: FieldDefinition[] } | null;
        setFields(schema?.fields || []);
      } else {
        setName('');
        setDescription('');
        setType('unstructured');
        setFields([]);
      }
    }
  }, [open, collection]);

  const addField = () => {
    setFields([
      ...fields,
      { name: '', type: 'text', required: false },
    ]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<FieldDefinition>) => {
    setFields(
      fields.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: '验证失败', description: '请输入集合名称', variant: 'destructive' });
      return;
    }
    if (type === 'structured' && fields.length === 0) {
      toast({ title: '验证失败', description: '结构化集合需要至少一个字段', variant: 'destructive' });
      return;
    }
    if (type === 'structured') {
      const invalid = fields.find((f) => !f.name.trim());
      if (invalid) {
        toast({ title: '验证失败', description: '请填写所有字段名称', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    try {
      if (collection) {
        const body = {
          name: name.trim(),
          description: description.trim() || undefined,
          schema_definition: type === 'structured' ? { fields } : undefined,
        };
        await documentApi.updateCollection(collection.id, body);
        toast({ title: '更新成功', description: '集合已更新' });
      } else {
        const body: CollectionCreate = {
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          schema_definition: type === 'structured' ? { fields } : undefined,
        };
        await documentApi.createCollection(body);
        toast({ title: '创建成功', description: '集合已创建' });
      }
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      toast({ title: '操作失败', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{collection ? '编辑集合' : '新建集合'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">名称 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：项目设计文档"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>类型</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as 'structured' | 'unstructured')}
              disabled={!!collection}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unstructured">非结构化（Markdown / 富文本）</SelectItem>
                <SelectItem value="structured">结构化（自定义字段，如账单）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'structured' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>字段定义</Label>
                <Button type="button" variant="outline" size="sm" onClick={addField}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加字段
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {fields.map((field, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 p-2 rounded border bg-muted/30"
                  >
                    <div className="flex gap-2 items-start">
                      <Input
                        placeholder="字段名"
                        value={field.name}
                        onChange={(e) => updateField(i, { name: e.target.value })}
                        className="flex-1"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(v) =>
                          updateField(i, { type: v as FieldDefinition['type'] })
                        }
                      >
                        <SelectTrigger className="w-28">
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
                      <label className="flex items-center gap-1 shrink-0 text-sm">
                        <Switch
                          checked={field.required}
                          onCheckedChange={(c) => updateField(i, { required: c })}
                        />
                        必填
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeField(i)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {(field.type === 'select' || field.type === 'multi_select') && (
                      <Input
                        placeholder="选项（逗号分隔，如：餐饮,交通,娱乐）"
                        value={(field.options || []).join(', ')}
                        onChange={(e) =>
                          updateField(i, {
                            options: e.target.value
                              .split(/[,，]/)
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '处理中...' : collection ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
