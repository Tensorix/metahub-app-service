/**
 * File content viewer/editor panel.
 */

import { Button } from '@/components/ui/button';
import { Save, Loader2 } from 'lucide-react';
import { getLanguageFromPath } from '@/lib/filesystemApi';
import { File, FileText, FileCode, FileJson } from 'lucide-react';

function getFileIcon(path: string) {
  const lang = getLanguageFromPath(path);
  switch (lang) {
    case 'javascript':
    case 'typescript':
    case 'python':
      return <FileCode className="h-4 w-4 text-blue-500" />;
    case 'json':
      return <FileJson className="h-4 w-4 text-yellow-500" />;
    case 'markdown':
      return <FileText className="h-4 w-4 text-purple-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

interface FileEditorProps {
  selectedPath: string | null;
  readonly: boolean;
  content: string;
  onContentChange: (content: string) => void;
  hasChanges: boolean;
  saving: boolean;
  loadingFile: boolean;
  onSave: () => void;
}

export function FileEditor({
  selectedPath,
  readonly,
  content,
  onContentChange,
  hasChanges,
  saving,
  loadingFile,
  onSave,
}: FileEditorProps) {
  if (!selectedPath) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        选择一个文件进行查看或编辑
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 overflow-hidden">
          {getFileIcon(selectedPath)}
          <span className="text-sm truncate">{selectedPath}</span>
          {readonly && <span className="text-xs text-muted-foreground">只读</span>}
          {hasChanges && !readonly && <span className="text-xs text-orange-500">●</span>}
        </div>
        {!readonly && (
          <Button size="sm" onClick={onSave} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-1">保存</span>
          </Button>
        )}
      </div>

      {loadingFile ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <textarea
          className="flex-1 p-3 font-mono text-sm resize-none bg-background focus:outline-none"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="文件内容..."
          spellCheck={false}
          readOnly={readonly}
        />
      )}
    </div>
  );
}
