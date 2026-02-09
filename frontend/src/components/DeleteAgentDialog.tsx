import { useState, useEffect } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Bot } from 'lucide-react';
import { agentManagementApi } from '@/lib/agentManagementApi';
import type { Agent } from '@/lib/agentManagementApi';

interface DeleteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: Agent;
  onConfirm: () => void;
}

export function DeleteAgentDialog({
  open, onOpenChange, agent, onConfirm,
}: DeleteAgentDialogProps) {
  const [parentAgents, setParentAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && agent.id) {
      setLoading(true);
      agentManagementApi
        .listParentAgents(agent.id)
        .then(setParentAgents)
        .catch(() => setParentAgents([]))
        .finally(() => setLoading(false));
    }
  }, [open, agent.id]);

  const hasParents = parentAgents.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasParents && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            确认删除
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                确定要删除 Agent「<strong>{agent.name}</strong>」吗？此操作不可撤销。
              </p>

              {loading ? (
                <p className="text-sm text-muted-foreground">检查引用关系中...</p>
              ) : hasParents ? (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20
                                rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    ⚠️ 此 Agent 正在被以下 Agent 作为子代理使用：
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {parentAgents.map((pa) => (
                      <Badge key={pa.id} variant="secondary">
                        <Bot className="h-3 w-3 mr-1" />
                        {pa.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    删除后，以上 Agent 的子代理配置将自动移除「{agent.name}」。
                  </p>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground
                       hover:bg-destructive/90"
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
