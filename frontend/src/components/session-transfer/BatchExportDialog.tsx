import { useState, useEffect } from 'react';
import { Archive, Calendar, Loader2, Filter } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSessionTransfer } from '@/hooks/useSessionTransfer';
import { sessionApi, type Session } from '@/lib/api';
import { getSessionTypeLabel } from '@/lib/utils';

interface BatchExportDialogProps {
  trigger?: React.ReactNode;
  preSelectedIds?: string[];
}

export function BatchExportDialog({ trigger, preSelectedIds = [] }: BatchExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 选择状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preSelectedIds));
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  
  // 导出选项
  const [format, setFormat] = useState<'json' | 'jsonl'>('jsonl');
  const [groupByType, setGroupByType] = useState(true);
  const [enableDateRange, setEnableDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const { batchExporting, exportBatch } = useSessionTransfer();
  const { toast } = useToast();

  // 加载会话列表
  useEffect(() => {
    if (open) {
      loadSessions();
    }
  }, [open]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const result = await sessionApi.getSessions({ size: 100 });
      setSessions(result.items);
    } catch {
      toast({ title: '加载失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // 筛选后的会话
  const filteredSessions = typeFilter.length > 0
    ? sessions.filter(s => typeFilter.includes(s.type))
    : sessions;

  // 按类型分组显示
  const sessionsByType = filteredSessions.reduce((acc, session) => {
    const type = session.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  const handleSelectAll = (type: string, checked: boolean) => {
    const typeSessions = sessionsByType[type] || [];
    const newSelected = new Set(selectedIds);
    typeSessions.forEach(s => {
      if (checked) {
        newSelected.add(s.id);
      } else {
        newSelected.delete(s.id);
      }
    });
    setSelectedIds(newSelected);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleExport = async () => {
    try {
      await exportBatch({
        sessionIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
        typeFilter: typeFilter.length > 0 ? typeFilter : undefined,
        format,
        groupByType,
        startDate: enableDateRange && startDate ? startDate : undefined,
        endDate: enableDateRange && endDate ? endDate : undefined,
      });
      toast({
        title: '导出成功',
        description: `已导出 ${selectedIds.size || filteredSessions.length} 个会话`,
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: '导出失败',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Archive className="h-4 w-4 mr-2" />
            批量导出
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>批量导出会话</DialogTitle>
          <DialogDescription>
            选择要导出的会话，将打包为 ZIP 文件
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 类型筛选 */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">类型筛选：</Label>
            {['ai', 'pm', 'group'].map((type) => (
              <Badge
                key={type}
                variant={typeFilter.includes(type) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  if (typeFilter.includes(type)) {
                    setTypeFilter(typeFilter.filter(t => t !== type));
                  } else {
                    setTypeFilter([...typeFilter, type]);
                  }
                }}
              >
                {getSessionTypeLabel(type)}
              </Badge>
            ))}
            {typeFilter.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTypeFilter([])}
              >
                清除
              </Button>
            )}
          </div>

          {/* 会话列表 */}
          <ScrollArea className="h-[250px] border rounded-md p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(sessionsByType).map(([type, typeSessions]) => {
                  const allSelected = typeSessions.every(s => selectedIds.has(s.id));
                  
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-background py-1">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked: boolean | 'indeterminate') => handleSelectAll(type, checked as boolean)}
                        />
                        <Label className="font-medium">
                          {getSessionTypeLabel(type)}
                          <span className="text-muted-foreground ml-1">
                            ({typeSessions.length})
                          </span>
                        </Label>
                      </div>
                      <div className="pl-6 space-y-1">
                        {typeSessions.map((session) => (
                          <div key={session.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedIds.has(session.id)}
                              onCheckedChange={(checked: boolean | 'indeterminate') => handleSelectOne(session.id, checked as boolean)}
                            />
                            <span className="text-sm truncate flex-1">
                              {session.name || '未命名会话'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="text-sm text-muted-foreground">
            已选择 {selectedIds.size} 个会话
            {selectedIds.size === 0 && ' (将导出所有筛选结果)'}
          </div>

          {/* 导出选项 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>导出格式</Label>
              <Select value={format} onValueChange={(value: string) => setFormat(value as 'json' | 'jsonl')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jsonl">JSONL（推荐）</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="group-type"
                checked={groupByType}
                onCheckedChange={(checked: boolean | 'indeterminate') => setGroupByType(checked as boolean)}
              />
              <Label htmlFor="group-type" className="text-sm">
                按类型分文件
              </Label>
            </div>
          </div>

          {/* 时间范围（增量导出） */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="date-range"
                checked={enableDateRange}
                onCheckedChange={(checked: boolean | 'indeterminate') => setEnableDateRange(checked as boolean)}
              />
              <Label htmlFor="date-range">
                <Calendar className="h-4 w-4 inline mr-1" />
                按时间范围筛选消息
              </Label>
            </div>
            
            {enableDateRange && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  placeholder="开始时间"
                />
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="结束时间"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={batchExporting}>
            {batchExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-2" />
                导出 ZIP
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
