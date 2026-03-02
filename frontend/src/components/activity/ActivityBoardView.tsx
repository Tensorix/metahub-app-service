import { motion, AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  pointerWithin,
  rectIntersection,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Card } from '@/components/ui/card';
import { useState, useMemo } from 'react';
import type { Activity } from '@/lib/activityApi';

// ──────────── Collision detection
// pointerWithin for column detection, rectIntersection as fallback for item-level sorting
const COLUMN_IDS = new Set(['pending', 'active', 'done', 'dismissed']);

const kanbanCollision: CollisionDetection = (args) => {
  // First try pointerWithin — reliable for detecting which column the pointer is in
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prefer sortable items over column droppables for precise ordering
    const itemHit = pointerCollisions.find((c) => !COLUMN_IDS.has(c.id as string));
    if (itemHit) return [itemHit];
    // Otherwise return column hit (empty column case)
    return [pointerCollisions[0]];
  }
  // Fallback to rectIntersection
  return rectIntersection(args);
};

// ──────────── Column config

const BOARD_COLUMNS = [
  { status: 'pending' as const, title: '待处理', emoji: '⏳', accent: 'border-t-amber-400' },
  { status: 'active' as const, title: '进行中', emoji: '🚀', accent: 'border-t-blue-400' },
  { status: 'done' as const, title: '已完成', emoji: '✅', accent: 'border-t-emerald-400' },
  { status: 'dismissed' as const, title: '已忽略', emoji: '💤', accent: 'border-t-gray-400' },
];

// ──────────── Droppable Column

interface ColumnProps {
  column: (typeof BOARD_COLUMNS)[0];
  activities: Activity[];
  onOpen: (activity: Activity) => void;
  onDelete: (id: string) => void;
  onStatusChange: (activity: Activity, status: Activity['status']) => void;
  onCreateInColumn?: (status: Activity['status']) => void;
}

function BoardColumn({ column, activities, onOpen, onDelete, onStatusChange, onCreateInColumn }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column header */}
      <div className={`rounded-t-xl border border-b-0 border-t-2 ${column.accent} bg-card px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{column.emoji}</span>
          <h3 className="font-semibold text-sm">{column.title}</h3>
          <Badge variant="secondary" className="h-5 min-w-5 justify-center text-[11px] font-medium">
            {activities.length}
          </Badge>
        </div>
        {onCreateInColumn && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onCreateInColumn(column.status)}
            className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.button>
        )}
      </div>

      {/* Card area */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 min-h-0 border border-t-0 rounded-b-xl transition-colors
          ${isOver ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'}
        `}
      >
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            <SortableContext
              items={activities.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
              id={column.status}
            >
              <AnimatePresence mode="popLayout">
                {activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onOpen={onOpen}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                    draggable
                    variant="compact"
                  />
                ))}
              </AnimatePresence>
            </SortableContext>

            {/* Empty state */}
            {activities.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-8 text-center"
              >
                <div className="text-2xl mb-2 opacity-30">{column.emoji}</div>
                <p className="text-xs text-muted-foreground">
                  拖拽卡片到此处
                </p>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ──────────── Board view

interface ActivityBoardViewProps {
  activities: Activity[];
  onOpen: (activity: Activity) => void;
  onDelete: (id: string) => void;
  onStatusChange: (activity: Activity, status: Activity['status']) => void;
  onReorder: (orderedIds: string[]) => void;
  onCreateInColumn?: (status: Activity['status']) => void;
}

export function ActivityBoardView({
  activities,
  onOpen,
  onDelete,
  onStatusChange,
  onReorder,
  onCreateInColumn,
}: ActivityBoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Group by status, sorted by sort_order
  const grouped = useMemo(() => {
    return BOARD_COLUMNS.reduce(
      (acc, col) => {
        acc[col.status] = activities
          .filter((a) => a.status === col.status)
          .sort((a, b) => a.sort_order - b.sort_order);
        return acc;
      },
      {} as Record<Activity['status'], Activity[]>
    );
  }, [activities]);

  // Find which column an activity id belongs to
  const findColumn = (id: string): Activity['status'] | null => {
    for (const col of BOARD_COLUMNS) {
      if (col.status === id) return col.status;
      if (grouped[col.status]?.some((a) => a.id === id)) return col.status;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback is handled by the useDroppable isOver state
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const act = activities.find((a) => a.id === activeIdStr);
    if (!act) return;

    const sourceCol = act.status;
    const targetCol = findColumn(overIdStr);
    if (!targetCol) return;

    if (sourceCol === targetCol) {
      // ── Same column: reorder
      const colItems = grouped[sourceCol];
      const oldIndex = colItems.findIndex((a) => a.id === activeIdStr);
      const newIndex = colItems.findIndex((a) => a.id === overIdStr);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(colItems, oldIndex, newIndex);
      // Collect all activities in the new order for the full reorder call:
      // We update sort_order for items in this column, keeping other columns unchanged
      const allOrdered: string[] = [];
      for (const col of BOARD_COLUMNS) {
        if (col.status === sourceCol) {
          allOrdered.push(...reordered.map((a) => a.id));
        } else {
          allOrdered.push(...(grouped[col.status] || []).map((a) => a.id));
        }
      }
      onReorder(allOrdered);
    } else {
      // ── Cross column: change status
      onStatusChange(act, targetCol);

      // Also figure out the insertion index within the target column
      const targetItems = [...(grouped[targetCol] || [])];
      const overIndex = targetItems.findIndex((a) => a.id === overIdStr);
      // Build new order for the full list after this item moves
      const allOrdered: string[] = [];
      for (const col of BOARD_COLUMNS) {
        if (col.status === sourceCol) {
          // Remove dragged item from source
          allOrdered.push(...grouped[sourceCol].filter((a) => a.id !== activeIdStr).map((a) => a.id));
        } else if (col.status === targetCol) {
          // Insert at the right position in target
          const itemsWithout = targetItems.filter((a) => a.id !== activeIdStr);
          const insertIdx = overIndex >= 0 ? overIndex : itemsWithout.length;
          itemsWithout.splice(insertIdx, 0, act);
          allOrdered.push(...itemsWithout.map((a) => a.id));
        } else {
          allOrdered.push(...(grouped[col.status] || []).map((a) => a.id));
        }
      }
      onReorder(allOrdered);
    }
  };

  const activeActivity = activeId ? activities.find((a) => a.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
        {BOARD_COLUMNS.map((column) => (
          <BoardColumn
            key={column.status}
            column={column}
            activities={grouped[column.status] || []}
            onOpen={onOpen}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onCreateInColumn={onCreateInColumn}
          />
        ))}
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeActivity ? (
          <Card className="p-3 shadow-2xl border-primary/30 w-64 ring-2 ring-primary/10">
            <div className="flex items-start gap-2 pl-2">
              <div className="flex-1">
                <h4 className="font-medium text-sm line-clamp-1">{activeActivity.name}</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">{activeActivity.type}</p>
              </div>
            </div>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
