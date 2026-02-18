import { useState, useCallback } from 'react';
import { Search, FileText, Table2, ChevronDown, X, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { SearchHit, SearchMode } from '@/lib/knowledgeApi';
import { useToast } from '@/hooks/use-toast';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

interface KnowledgeSearchPanelProps {
  folderIds?: string[];
  onSelectNode?: (nodeId: string) => void;
}

export function KnowledgeSearchPanel({
  folderIds,
  onSelectNode,
}: KnowledgeSearchPanelProps) {
  const { toast } = useToast();
  const { isMobile } = useBreakpoints();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('fuzzy');
  const [fuzzyWeight, setFuzzyWeight] = useState(0.4);
  const [vectorWeight, setVectorWeight] = useState(0.6);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await knowledgeApi.search({
        query: query.trim(),
        folder_ids: folderIds?.length ? folderIds : undefined,
        search_mode: searchMode,
        fuzzy_weight: searchMode === 'hybrid' ? fuzzyWeight : undefined,
        vector_weight: searchMode === 'hybrid' ? vectorWeight : undefined,
        top_k: 20,
        page: 1,
        size: 20,
      });
      setHits(res.hits);
      setTotal(res.total);

      if (typeof console !== 'undefined' && console.log) {
        console.log('[知识库检索] 查询:', query, '模式:', searchMode);
        console.table(
          res.hits.map((h, i) => ({
            序号: i + 1,
            节点: h.node_name,
            类型: h.node_type,
            综合得分: h.score?.toFixed(4) ?? '-',
            模糊得分: h.fuzzy_score?.toFixed(4) ?? '-',
            向量得分: h.vector_score?.toFixed(4) ?? '-',
            内容预览: (h.content_preview || '').slice(0, 50) + '...',
          }))
        );
      }
    } catch {
      toast({ title: '搜索失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [
    query,
    searchMode,
    fuzzyWeight,
    vectorWeight,
    folderIds,
    toast,
  ]);

  const formatScore = (v: number | null | undefined) =>
    v != null ? `${(v * 100).toFixed(1)}%` : '-';

  return (
    <>
      {isMobile && expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'fixed z-50 flex flex-col gap-2',
          isMobile ? 'inset-x-0 bottom-0 items-stretch pb-[env(safe-area-inset-bottom,0)]' : 'bottom-4 right-4 items-end'
        )}
      >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            'flex items-center gap-2 shadow-lg bg-card border hover:bg-accent/50 transition-colors',
            isMobile ? 'mx-4 mb-4 px-4 py-3 rounded-xl' : 'px-4 py-3 rounded-full'
          )}
          title="搜索知识库"
        >
          <Search className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">搜索</span>
        </button>
      ) : (
        <div
          className={cn(
            'rounded-xl border shadow-xl bg-card p-4 space-y-4 flex flex-col',
            isMobile
              ? 'mx-4 mb-4 w-[calc(100%-2rem)] max-h-[80vh] overflow-hidden flex flex-col'
              : 'w-full sm:w-[420px] max-w-[calc(100vw-2rem)]'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">知识库搜索</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              title="收起"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索知识库..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? '搜索中...' : '搜索'}
        </Button>
      </div>

      <div className={cn(isMobile ? 'space-y-3' : 'flex flex-wrap gap-4')}>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">检索模式</Label>
          <Select
            value={searchMode}
            onValueChange={(v: SearchMode) => setSearchMode(v)}
          >
            <SelectTrigger className={cn(isMobile ? 'flex-1' : 'w-[130px]')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fuzzy">模糊搜索</SelectItem>
              <SelectItem value="vector">向量搜索</SelectItem>
              <SelectItem value="hybrid">混合检索</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {searchMode === 'hybrid' &&
          (isMobile ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                权重设置
              </button>
              {showAdvanced && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs">模糊权重: {(fuzzyWeight * 100).toFixed(0)}%</Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={fuzzyWeight * 100}
                      onChange={(e) => setFuzzyWeight(Number(e.target.value) / 100)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">向量权重: {(vectorWeight * 100).toFixed(0)}%</Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={vectorWeight * 100}
                      onChange={(e) => setVectorWeight(Number(e.target.value) / 100)}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[180px]">
                <Label className="text-xs">模糊权重: {(fuzzyWeight * 100).toFixed(0)}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={fuzzyWeight * 100}
                  onChange={(e) => setFuzzyWeight(Number(e.target.value) / 100)}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 min-w-[180px]">
                <Label className="text-xs">向量权重: {(vectorWeight * 100).toFixed(0)}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vectorWeight * 100}
                  onChange={(e) => setVectorWeight(Number(e.target.value) / 100)}
                  className="w-full"
                />
              </div>
            </div>
          ))}
      </div>

      {hits.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            共 {total} 条结果
          </p>
          <div className={cn('overflow-y-auto space-y-2', isMobile ? 'max-h-[50vh]' : 'max-h-[320px]')}>
            {hits.map((hit, idx) => {
              const isExpanded = expandedId === String(idx);
              return (
                <div
                  key={hit.chunk_id ?? hit.node_id ?? hit.row_id ?? idx}
                  className="border rounded-md overflow-hidden"
                >
                  <div
                    className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      if (hit.node_id && onSelectNode) onSelectNode(hit.node_id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {hit.node_type === 'dataset_row' ? (
                            <Table2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="font-medium truncate">{hit.node_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {hit.node_type}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {hit.content_preview}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="p-1 hover:bg-muted rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : String(idx));
                        }}
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span title="综合得分">综合: {formatScore(hit.score)}</span>
                      {(hit.fuzzy_score != null || searchMode !== 'vector') && (
                        <span title="模糊匹配得分" className="text-muted-foreground">
                          模糊: {formatScore(hit.fuzzy_score)}
                        </span>
                      )}
                      {(hit.vector_score != null || searchMode !== 'fuzzy') && (
                        <span title="向量相似度" className="text-muted-foreground">
                          向量: {formatScore(hit.vector_score)}
                        </span>
                      )}
                    </div>
                    {hit.score != null && hit.score > 0 && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min((hit.score ?? 0) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="p-3 text-sm bg-muted/30 border-t">
                      <p className="whitespace-pre-wrap break-words">{hit.content_preview}</p>
                      {hit.parent_content && (
                        <p className="mt-2 text-muted-foreground text-xs">
                          父块: {hit.parent_content.slice(0, 200)}
                          {hit.parent_content.length > 200 ? '...' : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
        </div>
      )}
    </div>
    </>
  );
}
