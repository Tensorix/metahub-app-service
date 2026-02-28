import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Loader2, ArrowLeft, Download, FileJson, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { KnowledgeNode } from '@/lib/knowledgeApi';
import { LobeEditorWrapper } from '@/components/lobe-editor';
import type { LobeEditorWrapperHandle } from '@/components/lobe-editor';
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

export function DocumentEditor({ node, onUpdate, showBackButton, onBack }: DocumentEditorProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(node.name);
  const [contentJson, setContentJson] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const initialMount = useRef(true);
  const editorRef = useRef<LobeEditorWrapperHandle>(null);

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

  const handleEditorChange = useCallback((jsonString: string) => {
    setContentJson(jsonString);
    if (!initialMount.current) {
      setDirty(true);
    }
    initialMount.current = false;
  }, []);

  const handleUploadImage = useCallback(async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: '不支持的文件类型',
        description: '请上传图片文件（jpg、png、gif、webp 等）',
        variant: 'destructive',
      });
      throw new Error('不支持的文件类型');
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast({
        title: '文件过大',
        description: `图片大小不能超过 ${MAX_SIZE_MB}MB`,
        variant: 'destructive',
      });
      throw new Error('文件过大');
    }

    const formData = new FormData();
    formData.append('file', file);

    const { data } = await api.post<{ url: string }>(
      '/api/v1/knowledge/upload-image',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );

    if (!data?.url) {
      throw new Error('上传失败：未返回图片 URL');
    }

    return data.url;
  }, [toast]);

  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportJson = useCallback(() => {
    const json = editorRef.current?.exportJson() ?? contentJson;
    const filename = `${title || 'document'}.json`;
    downloadFile(json, filename, 'application/json');
  }, [contentJson, title, downloadFile]);

  const handleExportMarkdown = useCallback(() => {
    const md = editorRef.current?.exportMarkdown() ?? '';
    const filename = `${title || 'document'}.md`;
    downloadFile(md, filename, 'text/markdown');
  }, [title, downloadFile]);

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
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground shrink-0 h-8">
            <Download className="w-4 h-4" />
            导出
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportMarkdown}>
              <FileText className="w-4 h-4 mr-2" />
              导出为 Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportJson}>
              <FileJson className="w-4 h-4 mr-2" />
              导出为 Lexical JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Lexical editor */}
      <div className="flex-1 overflow-y-auto">
        <LobeEditorWrapper
          ref={editorRef}
          key={node.id}
          initialContent={node.content || undefined}
          onChange={handleEditorChange}
          onUploadImage={handleUploadImage}
        />
      </div>
    </div>
  );
}
