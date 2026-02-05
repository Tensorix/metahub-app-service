import { useState } from 'react';
import { Download, Calendar, Loader2, Settings2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSessionTransfer } from '@/hooks/useSessionTransfer';
import { formatDateForInput } from '@/lib/utils';

interface SessionExportDialogProps {
  sessionId: string;
  sessionName?: string;
  trigger?: React.ReactNode;
}

export function SessionExportDialog({
  sessionId,
  sessionName,
  trigger,
}: SessionExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'json' | 'jsonl'>('json');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [enableDateRange, setEnableDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const { exporting, exportSession } = useSessionTransfer();
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      await exportSession(sessionId, {
        format,
        includeDeleted,
        startDate: enableDateRange && startDate ? startDate : undefined,
        endDate: enableDateRange && endDate ? endDate : undefined,
      });
      toast({
        title: '导出成功',
        description: `会话 "${sessionName || '未命名'}" 已导出`,
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: '导出失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  // 快捷日期范围
  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
    setEnableDateRange(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4 mr-2" />
            高级导出
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>导出会话</DialogTitle>
          <DialogDescription>
            {sessionName || '选中的会话'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 导出格式 */}
          <div className="space-y-2">
            <Label>导出格式</Label>
            <Select value={format} onValueChange={(value: string) => setFormat(value as 'json' | 'jsonl')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON（易读）</SelectItem>
                <SelectItem value="jsonl">JSONL（流式处理）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 包含已删除 */}
          <div className="flex items-center justify-between">
            <Label htmlFor="include-deleted">包含已删除消息</Label>
            <Switch
              id="include-deleted"
              checked={includeDeleted}
              onCheckedChange={setIncludeDeleted}
            />
          </div>

          {/* 增量导出 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="date-range">
                <Calendar className="h-4 w-4 inline mr-1" />
                按时间范围导出
              </Label>
              <Switch
                id="date-range"
                checked={enableDateRange}
                onCheckedChange={setEnableDateRange}
              />
            </div>

            {enableDateRange && (
              <div className="space-y-2 pl-4 border-l-2">
                <div className="flex gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickRange(7)}
                  >
                    最近 7 天
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickRange(30)}
                  >
                    最近 30 天
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">开始时间</Label>
                    <Input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">结束时间</Label>
                    <Input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                导出
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
