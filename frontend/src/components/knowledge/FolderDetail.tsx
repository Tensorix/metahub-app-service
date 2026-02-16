import { Folder, Sparkles, FileText, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { KnowledgeNode } from '@/lib/knowledgeApi';

interface FolderDetailProps {
  node: KnowledgeNode;
  onToggleVector: () => void;
  onCreate: (type: 'folder' | 'document' | 'dataset') => void;
}

export function FolderDetail({ node, onToggleVector, onCreate }: FolderDetailProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
          <Folder className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">{node.name}</h2>
        {node.description && (
          <p className="text-sm text-muted-foreground max-w-md">{node.description}</p>
        )}
      </div>

      {/* Vector toggle */}
      <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <div className="flex-1">
          <Label className="text-sm font-medium">向量化检索</Label>
          <p className="text-xs text-muted-foreground">
            开启后，此文件夹下所有内容将生成 Embedding，支持语义搜索
          </p>
        </div>
        <Switch
          checked={node.vector_enabled}
          onCheckedChange={onToggleVector}
        />
      </div>

      {/* Quick create */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => onCreate('folder')}>
          <Folder className="w-4 h-4 mr-2" /> 新建子文件夹
        </Button>
        <Button variant="outline" onClick={() => onCreate('document')}>
          <FileText className="w-4 h-4 mr-2" /> 新建文档
        </Button>
        <Button variant="outline" onClick={() => onCreate('dataset')}>
          <Table2 className="w-4 h-4 mr-2" /> 新建表格
        </Button>
      </div>
    </div>
  );
}
