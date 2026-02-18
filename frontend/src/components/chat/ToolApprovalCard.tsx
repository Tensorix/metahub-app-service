import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Check, X } from 'lucide-react';

interface ToolApprovalCardProps {
  actionRequests: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
  reviewConfigs?: Array<{ action_name: string; allowed_decisions?: string[] }>;
  onApprove: () => void;
  onReject: () => void;
}

export function ToolApprovalCard({
  actionRequests,
  onApprove,
  onReject,
}: ToolApprovalCardProps) {
  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <span className="font-medium text-sm">需人工批准后继续执行</span>
      </div>
      <div className="space-y-2">
        {actionRequests.map((ar, idx) => (
          <div key={ar.id ?? idx} className="rounded border bg-background/80 p-3 text-sm">
            <div className="font-mono font-medium text-primary">{ar.name}</div>
            <pre className="mt-1 text-xs overflow-x-auto bg-muted/50 p-2 rounded">
              {JSON.stringify(ar.args, null, 2)}
            </pre>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove} className="gap-1">
          <Check className="h-4 w-4" />
          全部批准
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} className="gap-1">
          <X className="h-4 w-4" />
          全部拒绝
        </Button>
      </div>
    </Card>
  );
}
