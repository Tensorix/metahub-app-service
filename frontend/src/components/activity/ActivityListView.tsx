import { motion, AnimatePresence } from 'motion/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ActivityCard } from './ActivityCard';
import type { Activity } from '@/lib/activityApi';

interface ActivityListViewProps {
  activities: Activity[];
  onOpen: (activity: Activity) => void;
  onDelete: (id: string) => void;
  onStatusChange: (activity: Activity, status: Activity['status']) => void;
}

export function ActivityListView({ activities, onOpen, onDelete, onStatusChange }: ActivityListViewProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pb-4">
        <AnimatePresence mode="popLayout">
          {activities.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.15, delay: index * 0.02 }}
            >
              <ActivityCard
                activity={activity}
                onOpen={onOpen}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                variant="full"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}
