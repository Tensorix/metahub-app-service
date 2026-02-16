import { useState, useEffect } from 'react';
import { Folder, Sparkles, FileText, Table2, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type {
  KnowledgeNode,
  VectorizationConfig,
  VectorizationConfigUpdate,
  EmbeddingModelInfo,
} from '@/lib/knowledgeApi';
import { useToast } from '@/hooks/use-toast';

interface FolderDetailProps {
  node: KnowledgeNode;
  onToggleVector: () => void;
  onCreate: (type: 'folder' | 'document' | 'dataset') => void;
  onConfigUpdate?: () => void;
}

const DEFAULT_CONFIG: VectorizationConfig = {
  model_id: 'openai-3-large',
  chunk_size: 1000,
  chunk_overlap: 100,
  separators: ['\n\n', '\n'],
  preprocessing_rules: { remove_extra_whitespace: true, remove_urls: false },
  parent_child_mode: false,
  parent_chunk_size: 2000,
};

export function FolderDetail({
  node,
  onToggleVector,
  onCreate,
  onConfigUpdate,
}: FolderDetailProps) {
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const [models, setModels] = useState<EmbeddingModelInfo[]>([]);
  const [config, setConfig] = useState<VectorizationConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    knowledgeApi.getEmbeddingModels().then((r) => setModels(r.models));
  }, []);

  useEffect(() => {
    const c = node.vectorization_config;
    if (c) {
      setConfig({
        model_id: c.model_id ?? DEFAULT_CONFIG.model_id,
        chunk_size: c.chunk_size ?? DEFAULT_CONFIG.chunk_size,
        chunk_overlap: c.chunk_overlap ?? DEFAULT_CONFIG.chunk_overlap,
        separators: c.separators?.length ? c.separators : DEFAULT_CONFIG.separators,
        preprocessing_rules: c.preprocessing_rules ?? DEFAULT_CONFIG.preprocessing_rules,
        parent_child_mode: c.parent_child_mode ?? false,
        parent_chunk_size: c.parent_chunk_size ?? DEFAULT_CONFIG.parent_chunk_size,
      });
    } else {
      setConfig(DEFAULT_CONFIG);
    }
  }, [node.vectorization_config]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const update: VectorizationConfigUpdate = {
        model_id: config.model_id,
        chunk_size: config.chunk_size,
        chunk_overlap: config.chunk_overlap,
        separators: config.separators,
        preprocessing_rules: config.preprocessing_rules,
        parent_child_mode: config.parent_child_mode,
        parent_chunk_size: config.parent_chunk_size,
      };
      await knowledgeApi.updateVectorizationConfig(node.id, update);
      toast({ title: '配置已保存', description: '请重新执行向量化以应用新配置' });
      onConfigUpdate?.();
    } catch {
      toast({ title: '保存失败', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addSeparator = () => {
    setConfig((c) => ({
      ...c,
      separators: [...c.separators, ''],
    }));
  };

  const updateSeparator = (idx: number, val: string) => {
    setConfig((c) => {
      const s = [...c.separators];
      s[idx] = val;
      return { ...c, separators: s };
    });
  };

  const removeSeparator = (idx: number) => {
    setConfig((c) => ({
      ...c,
      separators: c.separators.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 overflow-y-auto">
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
      <div className="flex items-center gap-3 p-4 rounded-lg border bg-card w-full max-w-md">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
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

      {/* Vectorization config */}
      <div className="w-full max-w-md space-y-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings2 className="w-4 h-4 mr-2" />
          {showConfig ? '收起' : '展开'}向量化高级配置
        </Button>
        {showConfig && (
          <div className="p-4 rounded-lg border bg-card space-y-4">
            <p className="text-xs text-muted-foreground">
              修改后需重新执行向量化才能生效
            </p>

            <div>
              <Label className="text-sm">嵌入模型</Label>
              <Select
                value={config.model_id}
                onValueChange={(v) => setConfig((c) => ({ ...c, model_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.model_id} value={m.model_id}>
                      {m.model_id} ({m.dimensions}维)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">最大块长度</Label>
              <Input
                type="number"
                value={config.chunk_size}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, chunk_size: parseInt(e.target.value, 10) || 1000 }))
                }
                min={100}
                max={10000}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-sm">重叠长度</Label>
              <Input
                type="number"
                value={config.chunk_overlap}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    chunk_overlap: parseInt(e.target.value, 10) || 0,
                  }))
                }
                min={0}
                max={1000}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-sm">分隔符</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {config.separators.map((s, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <Input
                      value={s}
                      onChange={(e) => updateSeparator(i, e.target.value)}
                      placeholder="如 \n\n"
                      className="w-20 h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeSeparator(i)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addSeparator}>
                  + 添加
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                按优先级尝试的分隔符，用于切分文本
              </p>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <Switch
                  checked={config.preprocessing_rules?.remove_extra_whitespace ?? true}
                  onCheckedChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      preprocessing_rules: {
                        ...c.preprocessing_rules,
                        remove_extra_whitespace: v,
                      },
                    }))
                  }
                />
                <span className="text-sm">去除多余空白</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={config.preprocessing_rules?.remove_urls ?? false}
                  onCheckedChange={(v) =>
                    setConfig((c) => ({
                      ...c,
                      preprocessing_rules: {
                        ...c.preprocessing_rules,
                        remove_urls: v,
                      },
                    }))
                  }
                />
                <span className="text-sm">去除 URL</span>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-2">
                <Switch
                  checked={config.parent_child_mode}
                  onCheckedChange={(v) =>
                    setConfig((c) => ({ ...c, parent_child_mode: v }))
                  }
                />
                <span className="text-sm">父子分块模式</span>
              </label>
              {config.parent_child_mode && (
                <div>
                  <Label className="text-sm">父块大小</Label>
                  <Input
                    type="number"
                    value={config.parent_chunk_size}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        parent_chunk_size: parseInt(e.target.value, 10) || 2000,
                      }))
                    }
                    min={200}
                    max={20000}
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </Button>
          </div>
        )}
      </div>

      {/* Quick create */}
      <div className="flex gap-2 flex-wrap justify-center">
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
