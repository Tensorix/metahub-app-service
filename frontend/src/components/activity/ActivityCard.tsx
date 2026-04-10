import { motion } from 'motion/react';
import { Calendar, Tag, MoreHorizontal, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { RelationLink } from '@/components/RelationLink';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import type { Activity } from '@/lib/activityApi';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

// ──────────────────────────────────────────── helpers

const PRIORITY_CONFIG = [
  { min: 8, label: '紧急', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30' },
  { min: 5, label: '高', dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30' },
  { min: 3, label: '中', dot: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/30' },
  { min: 0, label: '低', dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/30' },
];

export function getPriorityConfig(p: number) {
  return PRIORITY_CONFIG.find((c) => p >= c.min) || PRIORITY_CONFIG[PRIORITY_CONFIG.length - 1];
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  active: '进行中',
  done: '已完成',
  dismissed: '已忽略',
};

const STATUS_NEXT: Record<string, Activity['status']> = {
  pending: 'active',
  active: 'done',
  done: 'dismissed',
  dismissed: 'pending',
};

export function formatRelativeDate(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = dayjs(dateStr);
  const now = dayjs();
  const diff = d.diff(now, 'day');
  if (diff < 0) return { text: `逾期 ${Math.abs(diff)} 天`, overdue: true };
  if (diff === 0) return { text: '今天截止', overdue: true };
  if (diff === 1) return { text: '明天截止', overdue: false };
  if (diff <= 7) return { text: `${diff} 天后截止`, overdue: false };
  return { text: d.format('MM/DD'), overdue: false };
}

// ──────────────────────────────────────────── types

export interface ActivityCardProps {
  activity: Activity;
  onOpen: (activity: Activity) => void;
  onDelete: (id: string) => void;
  onStatusChange?: (activity: Activity, newStatus: Activity['status']) => void;
  /** Enable drag handle & sortable behavior */
  draggable?: boolean;
  /** compact = board card, full = list card */
  variant?: 'compact' | 'full';
}

// ──────────────────────────────────────────── component

export function ActivityCard({
  activity,
  onOpen,
  onDelete,
  onStatusChange,
  draggable = false,
  variant = 'compact',
}: ActivityCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id, disabled: !draggable });

  const style = draggable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  const pCfg = getPriorityConfig(activity.priority);
  const dueInfo = formatRelativeDate(activity.due_date);

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
      >
        <Card
          ref={draggable ? setNodeRef : undefined}
          style={style}
          {...(draggable ? { ...attributes, ...listeners } : {})}
          className={`
            group relative overflow-hidden transition-all
            hover:shadow-md hover:border-primary/20
            ${variant === 'compact' ? 'p-3' : 'p-4'}
            ${isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}
            ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
          `}
          onClick={() => {
            if (!isDragging) onOpen(activity);
          }}
        >
          {/* Priority accent line */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${pCfg.dot} rounded-l`} />

          <div className={`flex items-start gap-2 ${variant === 'compact' ? 'pl-2' : 'pl-3'}`}>
            <div className="flex-1 min-w-0">
              {/* Row 1: Title + actions */}
              <div className="flex items-start justify-between gap-2">
                <h4 className={`font-medium leading-snug line-clamp-2 ${variant === 'compact' ? 'text-sm' : 'text-base'}`}>
                  {activity.name}
                </h4>

                {/* Quick actions (hover) */}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Status badge or quick-cycle button */}
                  {variant === 'full' && onStatusChange && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStatusChange(activity, STATUS_NEXT[activity.status]);
                          }}
                        >
                          <ArrowRight className="w-3 h-3" />
                          {STATUS_LABELS[STATUS_NEXT[activity.status]]}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        移至「{STATUS_LABELS[STATUS_NEXT[activity.status]]}」
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-muted transition-colors"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(activity)}>
                        编辑
                      </DropdownMenuItem>
                      {onStatusChange && Object.entries(STATUS_LABELS).map(([s, l]) =>
                        s !== activity.status ? (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => onStatusChange(activity, s as Activity['status'])}
                          >
                            移至「{l}」
                          </DropdownMenuItem>
                        ) : null
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(activity.id)}
                      >
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Row 2: Notes */}
              {activity.notes && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {activity.notes}
                </p>
              )}

              {/* Row 3: Tags */}
              {activity.tags && activity.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {activity.tags.slice(0, 4).map((tag, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 font-normal"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {activity.tags.length > 4 && (
                    <span className="text-[10px] text-muted-foreground self-center">
                      +{activity.tags.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Row 4: Relations */}
              {activity.relations && activity.relations.length > 0 && (
                <div
                  className="flex flex-wrap items-center gap-1 mt-2"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {activity.relations.slice(0, 3).map((r) => (
                    <RelationLink
                      key={`${r.type}-${r.id}`}
                      relation={r}
                      variant="compact"
                    />
                  ))}
                  {activity.relations.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{activity.relations.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Row 5: Footer meta */}
              <div className="flex items-center justify-between mt-2 gap-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    <span>{activity.type}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-medium ${pCfg.text} ${pCfg.bg} border-0`}>
                    P{activity.priority}
                  </Badge>
                </div>

                {dueInfo && (
                  <div className={`flex items-center gap-1 text-[11px] ${dueInfo.overdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                    <Calendar className="w-3 h-3" />
                    <span>{dueInfo.text}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status badge for full variant */}
          {variant === 'full' && (
            <div className="absolute top-3 right-3">
              <StatusDot status={activity.status} />
            </div>
          )}
        </Card>
      </motion.div>
    </TooltipProvider>
  );
}

// ──────────────────────────────────────────── status dot

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-500',
    active: 'bg-blue-500',
    done: 'bg-emerald-500',
    dismissed: 'bg-gray-400',
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger>
          <span className="relative flex h-2.5 w-2.5">
            {(status === 'pending' || status === 'active') && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors[status]} opacity-40`} />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors[status]}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{STATUS_LABELS[status]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
