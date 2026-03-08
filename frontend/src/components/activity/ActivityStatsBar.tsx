import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Clock, Zap, CheckCircle2, EyeOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { Activity } from '@/lib/activityApi';

interface ActivityStatsBarProps {
  activities: Activity[];
  onFilterStatus?: (status: Activity['status'] | null) => void;
  activeFilter?: Activity['status'] | null;
}

const STATUS_CONFIG = [
  {
    status: 'pending' as const,
    label: '待处理',
    icon: Clock,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    ring: 'ring-amber-500/20',
    barColor: 'bg-amber-500',
  },
  {
    status: 'active' as const,
    label: '进行中',
    icon: Zap,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
    ring: 'ring-blue-500/20',
    barColor: 'bg-blue-500',
  },
  {
    status: 'done' as const,
    label: '已完成',
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    ring: 'ring-emerald-500/20',
    barColor: 'bg-emerald-500',
  },
  {
    status: 'dismissed' as const,
    label: '已忽略',
    icon: EyeOff,
    color: 'text-gray-500 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900/40',
    border: 'border-gray-200 dark:border-gray-700',
    ring: 'ring-gray-500/20',
    barColor: 'bg-gray-400',
  },
];

export function ActivityStatsBar({ activities, onFilterStatus, activeFilter }: ActivityStatsBarProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { pending: 0, active: 0, done: 0, dismissed: 0 };
    activities.forEach((a) => {
      if (!a.is_deleted) map[a.status] = (map[a.status] || 0) + 1;
    });
    return map;
  }, [activities]);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3">
        {/* Stats cards */}
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_CONFIG.map((cfg) => {
            const Icon = cfg.icon;
            const count = counts[cfg.status] || 0;
            const isActive = activeFilter === cfg.status;

            return (
              <Tooltip key={cfg.status}>
                <TooltipTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onFilterStatus?.(isActive ? null : cfg.status)}
                    className={`
                      relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-all
                      ${cfg.bg} ${cfg.border}
                      ${isActive ? `ring-2 ${cfg.ring} shadow-sm` : 'hover:shadow-sm'}
                      cursor-pointer select-none flex-shrink-0 min-w-[140px]
                    `}
                  >
                    <div className={`rounded-lg p-2 ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex flex-col items-start">
                      <motion.span
                        key={count}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`text-xl font-bold leading-none ${cfg.color}`}
                      >
                        {count}
                      </motion.span>
                      <span className="text-xs text-muted-foreground mt-0.5">{cfg.label}</span>
                    </div>
                    {isActive && (
                      <motion.div
                        layoutId="statsIndicator"
                        className={`absolute -bottom-px left-3 right-3 h-0.5 rounded-full ${cfg.barColor}`}
                      />
                    )}
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent>
                  {isActive ? '点击取消筛选' : `筛选${cfg.label}活动`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/50">
            {STATUS_CONFIG.map((cfg) => {
              const pct = ((counts[cfg.status] || 0) / total) * 100;
              if (pct === 0) return null;
              return (
                <motion.div
                  key={cfg.status}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={`${cfg.barColor} first:rounded-l-full last:rounded-r-full`}
                />
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
