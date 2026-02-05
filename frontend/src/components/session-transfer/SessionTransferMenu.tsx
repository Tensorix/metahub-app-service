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
  onImportClick?: () => void;
  onBatchExportClick?: () => void;
  onAdvancedExportClick?: () => void;
}

export function SessionTransferMenu({
  sessionId,
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
      <DropdownMenuTrigger>
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
