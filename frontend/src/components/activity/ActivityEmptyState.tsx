import { motion } from 'motion/react';
import { ListTodo, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityEmptyStateProps {
  onCreate: () => void;
}

export function ActivityEmptyState({ onCreate }: ActivityEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center h-full"
    >
      <motion.div
        initial={{ y: 10 }}
        animate={{ y: [10, -5, 10] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-8 mb-6"
      >
        <ListTodo className="h-14 w-14 text-brand/60" strokeWidth={1.5} />
      </motion.div>

      <h3 className="text-xl font-semibold mb-2">开始管理您的活动</h3>
      <p className="text-muted-foreground text-center mb-8 max-w-sm leading-relaxed">
        创建任务、会议、提醒等活动，通过看板追踪进度，<br/>
        关联会话和文档让工作更有条理。
      </p>

      <Button onClick={onCreate} size="lg" className="gap-2 rounded-xl px-6">
        <Sparkles className="w-4 h-4" />
        创建第一个活动
      </Button>
    </motion.div>
  );
}
