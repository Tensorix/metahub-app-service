import { MessageSquare, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { staggerContainer, fadeUp } from '@/lib/motion';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon: Icon = MessageSquare, action }: EmptyStateProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center py-12 px-4"
    >
      <motion.div
        variants={fadeUp}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-2xl bg-brand/8 p-6 mb-4"
      >
        <Icon className="h-12 w-12 text-brand" />
      </motion.div>
      <motion.h3 variants={fadeUp} className="text-lg font-semibold mb-2">{title}</motion.h3>
      <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-6 max-w-sm">
        {description}
      </motion.p>
      {action && (
        <motion.div variants={fadeUp}>
          <Button onClick={action.onClick} variant="outline">
            {action.label}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
