import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Save, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { KnowledgeNode } from '@/lib/knowledgeApi';
import { NovelEditor } from '@/components/novel';
import type { JSONContent } from 'novel';
import { createImageUpload } from 'novel';
import { api } from '@/lib/api';

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface DocumentEditorProps {
  node: KnowledgeNode;
  onUpdate: () => void;
  /** 移动端：在标题左侧显示返回按钮 */
  showBackButton?: boolean;
  onBack?: () => void;
}

function parseInitialContent(content: string | null): JSONContent | undefined {
  if (!content || !content.trim()) {
    return undefined;
  }
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(content!) as JSONContent;
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
        return parsed;
      }
    } catch {
      // Fall through to legacy Markdown handling
    }
  }
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: trimmed
          ? [{ type: 'text', text: trimmed }]
          : undefined,
      },
    ],
  };
}

export function DocumentEditor({ node, onUpdate, showBackButton, onBack }: DocumentEditorProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(node.name);
  const [contentJson, setContentJson] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialMount = useRef(true);

  const initialContent = parseInitialContent(node.content);

  const uploadFn = useMemo(() => createImageUpload({
    validateFn: (file) => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: '不支持的文件类型',
          description: '请上传图片文件（jpg、png、gif、webp 等）',
          variant: 'destructive',
        });
        return false;
      }
      if (file.size > MAX_SIZE_BYTES) {
        toast({
          title: '文件过大',
          description: `图片大小不能超过 ${MAX_SIZE_MB}MB`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    },
    onUpload: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post<{ url: string }>(
        '/api/v1/knowledge/upload-image',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (!data?.url) {
        throw new Error('上传失败：未返回图片 URL');
      }

      return data.url;
    },
  }), [toast]);

  useEffect(() => {
    setTitle(node.name);
    setDirty(false);
    initialMount.current = true;
    if (node.content) {
      setContentJson(node.content);
    } else {
      setContentJson('');
    }
  }, [node.id, node.name, node.content]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (title !== node.name) updates.name = title;
      if (contentJson !== (node.content || '')) updates.content = contentJson;
      if (Object.keys(updates).length > 0) {
        await knowledgeApi.updateNode(node.id, updates);
        toast({ title: '已保存' });
        setDirty(false);
        onUpdate();
      }
    } catch {
      toast({ title: '保存失败', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [title, contentJson, node, toast, onUpdate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleEditorChange = useCallback((json: JSONContent) => {
    const str = JSON.stringify(json);
    setContentJson(str);
    if (!initialMount.current) {
      setDirty(true);
    }
    initialMount.current = false;
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar - [返回] [文档标题] [保存] 同一行 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        {showBackButton && onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 h-9 w-9"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0 h-auto flex-1 min-w-0"
          placeholder="文档标题"
        />
        <Button
          variant={dirty ? 'default' : 'outline'}
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="shrink-0"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          {saving ? '保存中' : '保存'}
        </Button>
      </div>

      {/* Novel editor */}
      <div className="flex-1 overflow-y-auto">
        <NovelEditor
          key={node.id}
          initialContent={initialContent}
          onChange={handleEditorChange}
          uploadFn={uploadFn}
        />
      </div>
    </div>
  );
}
