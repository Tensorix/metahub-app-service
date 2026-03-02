import { motion, AnimatePresence } from 'motion/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ActivityCard } from './ActivityCard';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Card } from '@/components/ui/card';
import { useState, useMemo } from 'react';
import type { Activity } from '@/lib/activityApi';

interface ActivityListViewProps {
  activities: Activity[];
  onOpen: (activity: Activity) => void;
  onDelete: (id: string) => void;
  onStatusChange: (activity: Activity, status: Activity['status']) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function ActivityListView({ activities, onOpen, onDelete, onStatusChange, onReorder }: ActivityListViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const sorted = useMemo(
    () => [...activities].sort((a, b) => a.sort_order - b.sort_order),
    [activities]
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex((a) => a.id === active.id);
    const newIndex = sorted.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);
    onReorder(reordered.map((a) => a.id));
  };

  const activeActivity = activeId ? sorted.find((a) => a.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ScrollArea className="h-full">
        <div className="space-y-2 pb-4">
          <SortableContext items={sorted.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence mode="popLayout">
              {sorted.map((activity, index) => (
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
                    draggable
                    variant="full"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </SortableContext>
        </div>
      </ScrollArea>

      <DragOverlay dropAnimation={null}>
        {activeActivity ? (
          <Card className="p-4 shadow-2xl border-primary/30 w-full max-w-2xl ring-2 ring-primary/10">
            <h4 className="font-medium text-sm line-clamp-1">{activeActivity.name}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">{activeActivity.type}</p>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
