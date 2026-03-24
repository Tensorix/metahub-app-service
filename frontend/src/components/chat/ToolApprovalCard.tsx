import { Button } from '@/components/ui/button';
import { ShieldCheck, Check, X, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { CodeBlock } from './CodeBlock';

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <h4 className="text-sm font-medium">需要人工批准</h4>
          <p className="text-xs text-muted-foreground">{actionRequests.length} 个操作待确认</p>
        </div>
      </div>
      <div className="space-y-2">
        {actionRequests.map((ar, idx) => (
          <div key={ar.id ?? idx} className="rounded-lg border bg-background/80 p-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-mono text-sm font-medium">{ar.name}</span>
            </div>
            <CodeBlock className="mt-2" content={JSON.stringify(ar.args, null, 2)} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove} className="gap-1.5">
          <Check className="h-3.5 w-3.5" /> 全部批准
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} className="gap-1.5">
          <X className="h-3.5 w-3.5" /> 全部拒绝
        </Button>
      </div>
    </motion.div>
  );
}
