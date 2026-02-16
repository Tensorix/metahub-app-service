import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { KnowledgeNode } from '@/lib/knowledgeApi';

interface DocumentEditorProps {
  node: KnowledgeNode;
  onUpdate: () => void;
}

export function DocumentEditor({ node, onUpdate }: DocumentEditorProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(node.name);
  const [content, setContent] = useState(node.content || '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(node.name);
    setContent(node.content || '');
    setDirty(false);
  }, [node.id, node.name, node.content]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (title !== node.name) updates.name = title;
      if (content !== (node.content || '')) updates.content = content;
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
  }, [title, content, node, toast, onUpdate]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0 h-auto"
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

      {/* Editor area — textarea for Markdown editing (Novel integration placeholder) */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          <textarea
            ref={editorRef as unknown as React.RefObject<HTMLTextAreaElement>}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            className="w-full min-h-[calc(100vh-200px)] bg-transparent border-none outline-none resize-none text-sm leading-relaxed font-mono"
            placeholder="开始编写文档内容（Markdown 格式）..."
          />
        </div>
      </div>
    </div>
  );
}
