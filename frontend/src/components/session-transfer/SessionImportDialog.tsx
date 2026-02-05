import { useState, useCallback } from 'react';
import { Upload, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
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
                      <Alert>
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
