import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={exporting}
      title="快速导出（JSON 格式）"
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {size !== 'icon' && <span className="ml-2">导出</span>}
    </Button>
  );
}
