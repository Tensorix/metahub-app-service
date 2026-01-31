# 步骤 5：前端 UI 组件设计

## 组件结构

```
frontend/src/components/
├── session-transfer/
│   ├── SessionExportButton.tsx       # 单会话导出按钮
│   ├── SessionExportDialog.tsx       # 高级导出对话框（增量导出）
│   ├── BatchExportDialog.tsx         # 批量导出对话框
│   ├── SessionImportDialog.tsx       # 导入对话框
│   ├── ImportPreview.tsx             # 导入预览组件
│   └── SessionTransferMenu.tsx       # 导入导出菜单
```

---

## 1. 单会话导出按钮（快捷导出）

### 文件：`frontend/src/components/session-transfer/SessionExportButton.tsx`

```tsx
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useSessionTransfer } from '@/hooks/useSessionTransfer';

interface SessionExportButtonProps {
  sessionId: string;
  sessionName?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
}

export function SessionExportButton({
  sessionId,
  sessionName,
  variant = 'ghost',
  size = 'icon',
}: SessionExportButtonProps) {
  const { exporting, exportSession } = useSessionTransfer();
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      await exportSession(sessionId, { format: 'json' });
      toast({
        title: '导出成功',
        description: `会话 "${sessionName || '未命名'}" 已导出`,
      });
    } catch (error: any) {
      toast({
        title: '导出失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {size !== 'icon' && <span className="ml-2">导出</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>快速导出（JSON 格式）</TooltipContent>
    </Tooltip>
  );
}
```

---

## 2. 高级导出对话框（支持增量导出）

### 文件：`frontend/src/components/session-transfer/SessionExportDialog.tsx`

```tsx
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
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
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
```

---

## 3. 批量导出对话框

### 文件：`frontend/src/components/session-transfer/BatchExportDialog.tsx`

```tsx
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
import { sessionApi, Session } from '@/lib/api';
import { getSessionTypeLabel, formatDateForInput } from '@/lib/utils';

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
  
  const { batchExporting, exportBatch, batchExportError } = useSessionTransfer();
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
      const result = await sessionApi.getSessions({ limit: 100 });
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
                  const someSelected = typeSessions.some(s => selectedIds.has(s.id));
                  
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-background py-1">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={someSelected && !allSelected}
                          onCheckedChange={(c) => handleSelectAll(type, c as boolean)}
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
                              onCheckedChange={(c) => handleSelectOne(session.id, c as boolean)}
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
              <Select value={format} onValueChange={(v) => setFormat(v as any)}>
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
                onCheckedChange={(c) => setGroupByType(c as boolean)}
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
                onCheckedChange={(c) => setEnableDateRange(c as boolean)}
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
```

---

## 4. 导入对话框组件

### 文件：`frontend/src/components/session-transfer/SessionImportDialog.tsx`

```tsx
import { useState, useCallback } from 'react';
import { Upload, FileJson, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useSessionTransfer } from '@/hooks/useSessionTransfer';
import { formatFileSize, getSessionTypeLabel } from '@/lib/utils';

interface SessionImportDialogProps {
  onSuccess?: (sessionIds: string[]) => void;
  trigger?: React.ReactNode;
}

export function SessionImportDialog({ onSuccess, trigger }: SessionImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mergeSenders, setMergeSenders] = useState(true);
  const [step, setStep] = useState<'select' | 'preview' | 'importing'>('select');
  
  const {
    importing,
    importSessions,
    importError,
    importResult,
    previewing,
    previewImport,
    previewResult,
    previewError,
    clearErrors,
    clearPreview,
    clearImportResult,
  } = useSessionTransfer();
  const { toast } = useToast();

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    clearErrors();
    clearPreview();
    
    // 自动预览
    const result = await previewImport(selectedFile);
    if (result) {
      setStep('preview');
    }
  }, [previewImport, clearErrors, clearPreview]);

  const handleImport = async () => {
    if (!file) return;
    
    setStep('importing');
    try {
      const result = await importSessions(file, { mergeSenders });
      
      if (result) {
        toast({
          title: '导入成功',
          description: `已导入 ${result.imported_sessions.length} 个会话`,
        });
        setOpen(false);
        resetState();
        onSuccess?.(result.imported_sessions.map(s => s.session_id));
      }
    } catch (error: any) {
      setStep('preview');
      toast({
        title: '导入失败',
        description: error.message || '请检查文件格式',
        variant: 'destructive',
      });
    }
  };

  const resetState = () => {
    setFile(null);
    setMergeSenders(true);
    setStep('select');
    clearErrors();
    clearPreview();
    clearImportResult();
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetState();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            导入会话
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>导入会话数据</DialogTitle>
          <DialogDescription>
            支持 JSON、JSONL 或 ZIP 导出文件
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 文件选择 */}
          <div className="space-y-2">
            <Label htmlFor="file">选择文件</Label>
            <Input
              id="file"
              type="file"
              accept=".json,.jsonl,.zip"
              onChange={handleFileChange}
              disabled={importing}
              className="cursor-pointer"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} ({formatFileSize(file.size)})
              </p>
            )}
          </div>

          {/* 加载状态 */}
          {previewing && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">正在解析文件...</span>
            </div>
          )}

          {/* 预览结果 */}
          {previewResult && step === 'preview' && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                {previewResult.valid ? (
                  <>
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">文件验证通过</span>
                    </div>
                    
                    {/* 重复导入警告 */}
                    {previewResult.duplicate_check?.has_duplicates && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          检测到此文件之前已导入过。继续导入将创建新的会话副本。
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">格式:</div>
                      <div>{previewResult.format} v{previewResult.version}</div>
                      
                      <div className="text-muted-foreground">会话数:</div>
                      <div>{previewResult.sessions.length}</div>
                      
                      <div className="text-muted-foreground">总消息:</div>
                      <div>{previewResult.total_statistics?.total_messages || 0}</div>
                    </div>
                    
                    {/* 会话预览列表 */}
                    {previewResult.sessions.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">会话列表：</Label>
                        <ScrollArea className="h-[100px] border rounded p-2">
                          {previewResult.sessions.map((session, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm py-1">
                              <span className="text-muted-foreground">
                                [{getSessionTypeLabel(session.type)}]
                              </span>
                              <span className="truncate">
                                {session.name || '未命名'}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {session.message_count} 条
                              </span>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                    )}
                    
                    {previewResult.warnings.length > 0 && (
                      <Alert variant="warning">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {previewResult.warnings.join('; ')}
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">文件验证失败</span>
                    </div>
                    <ul className="text-sm text-destructive list-disc pl-5">
                      {previewResult.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 导入选项 */}
          {previewResult?.valid && step === 'preview' && (
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label htmlFor="merge">合并发送者</Label>
                <p className="text-xs text-muted-foreground">
                  相同名称的发送者将复用已有记录
                </p>
              </div>
              <Switch
                id="merge"
                checked={mergeSenders}
                onCheckedChange={setMergeSenders}
                disabled={importing}
              />
            </div>
          )}

          {/* 错误提示 */}
          {(importError || previewError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {importError || previewError}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={!previewResult?.valid || importing}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                确认导入
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. 导入导出菜单组件

### 文件：`frontend/src/components/session-transfer/SessionTransferMenu.tsx`

```tsx
import { Download, Upload, MoreHorizontal, Settings2, Archive } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useSessionTransfer } from '@/hooks/useSessionTransfer';
import { useToast } from '@/hooks/use-toast';

interface SessionTransferMenuProps {
  sessionId?: string;
  sessionName?: string;
  onImportClick?: () => void;
  onBatchExportClick?: () => void;
  onAdvancedExportClick?: () => void;
}

export function SessionTransferMenu({
  sessionId,
  sessionName,
  onImportClick,
  onBatchExportClick,
  onAdvancedExportClick,
}: SessionTransferMenuProps) {
  const { exporting, exportSession } = useSessionTransfer();
  const { toast } = useToast();

  const handleQuickExport = async (format: 'json' | 'jsonl') => {
    if (!sessionId) return;
    try {
      await exportSession(sessionId, { format });
      toast({
        title: '导出成功',
        description: '文件已下载',
      });
    } catch (error: any) {
      toast({
        title: '导出失败',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* 当前会话导出 */}
        {sessionId && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? '导出中...' : '导出会话'}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleQuickExport('json')}>
                  JSON 格式
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleQuickExport('jsonl')}>
                  JSONL 格式
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onAdvancedExportClick}>
                  <Settings2 className="h-4 w-4 mr-2" />
                  高级导出...
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}

        {/* 批量导出 */}
        <DropdownMenuItem onClick={onBatchExportClick}>
          <Archive className="h-4 w-4 mr-2" />
          批量导出...
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* 导入 */}
        <DropdownMenuItem onClick={onImportClick}>
          <Upload className="h-4 w-4 mr-2" />
          导入会话...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## 6. 集成到现有 UI

### 在 SessionSidebar 中添加导入导出入口

```tsx
// frontend/src/components/chat/SessionSidebar.tsx

import { useState } from 'react';
import { SessionExportButton } from '@/components/session-transfer/SessionExportButton';
import { SessionExportDialog } from '@/components/session-transfer/SessionExportDialog';
import { SessionImportDialog } from '@/components/session-transfer/SessionImportDialog';
import { BatchExportDialog } from '@/components/session-transfer/BatchExportDialog';
import { SessionTransferMenu } from '@/components/session-transfer/SessionTransferMenu';

export function SessionSidebar() {
  const [importOpen, setImportOpen] = useState(false);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  
  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between p-2 border-b">
        <h2 className="font-semibold">会话列表</h2>
        <div className="flex items-center gap-1">
          <BatchExportDialog 
            trigger={
              <Button variant="ghost" size="icon" title="批量导出">
                <Archive className="h-4 w-4" />
              </Button>
            }
          />
          <SessionImportDialog 
            trigger={
              <Button variant="ghost" size="icon" title="导入会话">
                <Upload className="h-4 w-4" />
              </Button>
            }
            onSuccess={(ids) => {
              refreshSessions();
              if (ids.length === 1) {
                selectSession(ids[0]);
              }
            }}
          />
        </div>
      </div>

      {/* 会话列表 */}
      <ScrollArea className="flex-1">
        {sessions.map((session) => (
          <div key={session.id} className="group flex items-center p-2 hover:bg-accent">
            <div className="flex-1 truncate">
              {session.name || '未命名会话'}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition">
              <SessionExportButton
                sessionId={session.id}
                sessionName={session.name}
                size="icon"
                variant="ghost"
              />
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
```

### 在 SessionDetail 操作区添加

```tsx
// frontend/src/components/SessionDetail.tsx

import { SessionExportDialog } from '@/components/session-transfer/SessionExportDialog';
import { SessionTransferMenu } from '@/components/session-transfer/SessionTransferMenu';

export function SessionDetail({ session }: { session: Session }) {
  const [showImport, setShowImport] = useState(false);
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* 快捷导出按钮 */}
      <SessionExportButton
        sessionId={session.id}
        sessionName={session.name}
        size="sm"
        variant="outline"
      />
      
      {/* 更多操作菜单 */}
      <SessionTransferMenu
        sessionId={session.id}
        sessionName={session.name}
        onImportClick={() => setShowImport(true)}
        onBatchExportClick={() => setShowBatchExport(true)}
        onAdvancedExportClick={() => setShowAdvancedExport(true)}
      />

      {/* 对话框 */}
      <SessionImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        onSuccess={(ids) => {
          setShowImport(false);
          refreshSessions();
        }}
      />
      
      <BatchExportDialog
        open={showBatchExport}
        onOpenChange={setShowBatchExport}
      />
      
      <SessionExportDialog
        sessionId={session.id}
        sessionName={session.name}
        open={showAdvancedExport}
        onOpenChange={setShowAdvancedExport}
      />
    </div>
  );
}
```

---

## UI/UX 设计要点

### 1. 导出体验

- **快捷导出**：点击即导出 JSON，无需额外确认
- **高级导出**：支持格式选择、增量导出（时间范围）
- **批量导出**：可选择多个会话，按类型分组导出 ZIP
- 显示加载状态，下载完成后 toast 通知
- 文件名包含会话名称/类型和时间戳

### 2. 导入体验

- 支持 JSON、JSONL、ZIP 三种格式
- 拖放或点击选择文件
- 自动预览文件内容，显示会话列表
- **重复导入检测**：提示用户此文件曾经导入过
- 进度指示和成功反馈

### 3. 错误处理

- 文件格式错误清晰提示
- 网络错误重试引导
- 部分导入失败时显示详情

### 4. 响应式设计

- 对话框在移动端全屏显示
- 按钮图标在小屏幕上隐藏文字
- 文件选择区域触摸友好

### 5. 批量操作优化

- 类型筛选可快速选择 AI 对话 / 私聊 / 群聊
- 全选/取消全选按类型分组
- 选择计数实时显示
