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
import { useToast } from '@/hooks/use-toast';
import { documentApi } from '@/lib/documentApi';
import type {
  Document,
  DocumentCollection,
  DocumentCreate,
  DocumentUpdate,
  FieldDefinition,
} from '@/lib/documentApi';

interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: DocumentCollection;
  document: Document | null;
  onSuccess: () => void;
}

function StructuredForm({
  schemaFields,
  data,
  onChange,
}: {
  schemaFields: FieldDefinition[];
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      {schemaFields.map((fd) => (
        <div key={fd.name} className="space-y-2">
          <Label>
            {fd.name}
            {fd.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {fd.type === 'text' && (
            <Input
              value={String(data[fd.name] ?? '')}
              onChange={(e) => onChange({ ...data, [fd.name]: e.target.value })}
              placeholder={fd.description}
            />
          )}
          {fd.type === 'number' && (
            <Input
              type="number"
              value={String(data[fd.name] ?? '')}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...data,
                  [fd.name]: v === '' ? undefined : Number(v),
                });
              }}
            />
          )}
          {fd.type === 'date' && (
            <Input
              type="date"
              value={String(data[fd.name] ?? '').slice(0, 10)}
              onChange={(e) => onChange({ ...data, [fd.name]: e.target.value })}
            />
          )}
          {fd.type === 'datetime' && (
            <Input
              type="datetime-local"
              value={String(data[fd.name] ?? '').slice(0, 16)}
              onChange={(e) => onChange({ ...data, [fd.name]: e.target.value })}
            />
          )}
          {fd.type === 'boolean' && (
            <Select
              value={String(data[fd.name] ?? '')}
              onValueChange={(v) =>
                onChange({ ...data, [fd.name]: v === 'true' })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">是</SelectItem>
                <SelectItem value="false">否</SelectItem>
              </SelectContent>
            </Select>
          )}
          {fd.type === 'select' && (
            <Select
              value={String(data[fd.name] ?? '')}
              onValueChange={(v) => onChange({ ...data, [fd.name]: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {(fd.options || []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fd.type === 'multi_select' && (
            <div className="flex flex-wrap gap-2">
              {(fd.options || []).map((o) => {
                const arr = (data[fd.name] as string[] | undefined) || [];
                const checked = arr.includes(o);
                return (
                  <Button
                    key={o}
                    type="button"
                    variant={checked ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const next = checked
                        ? arr.filter((x) => x !== o)
                        : [...arr, o];
                      onChange({ ...data, [fd.name]: next });
                    }}
                  >
                    {o}
                  </Button>
                );
              })}
            </div>
          )}
          {fd.type === 'url' && (
            <Input
              type="url"
              value={String(data[fd.name] ?? '')}
              onChange={(e) => onChange({ ...data, [fd.name]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function DocumentDialog({
  open,
  onOpenChange,
  collection,
  document,
  onSuccess,
}: DocumentDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});

  const schema = collection.schema_definition as { fields?: FieldDefinition[] } | null;
  const schemaFields = schema?.fields || [];

  useEffect(() => {
    if (open) {
      if (document) {
        setTitle(document.title);
        setContent(document.content || '');
        setData(document.data || {});
      } else {
        setTitle('');
        setContent('');
        setData({});
      }
    }
  }, [open, document]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: '验证失败', description: '请输入标题', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (document) {
        const body: DocumentUpdate =
          collection.type === 'structured'
            ? { title: title.trim(), data }
            : { title: title.trim(), content };
        await documentApi.updateDocument(document.id, body);
        toast({ title: '更新成功', description: '文档已更新' });
      } else {
        const body: DocumentCreate =
          collection.type === 'structured'
            ? { title: title.trim(), data }
            : { title: title.trim(), content };
        await documentApi.createDocument(collection.id, body);
        toast({ title: '创建成功', description: '文档已创建' });
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
          <DialogTitle>{document ? '编辑文档' : '新建文档'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">标题 *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文档标题"
            />
          </div>

          {collection.type === 'unstructured' ? (
            <div className="space-y-2">
              <Label htmlFor="content">内容</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Markdown 或纯文本"
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          ) : (
            <StructuredForm
              schemaFields={schemaFields}
              data={data}
              onChange={setData}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '处理中...' : document ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
