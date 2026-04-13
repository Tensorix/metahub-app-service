import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  MessageSquare,
  Bot,
  CheckSquare,
  BookOpen,
  Clock,
  ArrowRight,
  CircleCheck,
  Bell,
  AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { sessionApi, type Session } from '@/lib/api';
import { activityApi, type Activity } from '@/lib/activityApi';
import { Skeleton } from '@/components/ui/skeleton';
import { staggerContainer, fadeUp } from '@/lib/motion';
import { formatRelativeTime } from '@/lib/utils';

/* ─── Quick-action definitions ─── */

const QUICK_ACTIONS = [
  {
    icon: MessageSquare,
    label: '会话',
    description: '开始 AI 对话',
    path: '/sessions',
  },
  {
    icon: Bot,
    label: 'Agents',
    description: '管理 AI 代理',
    path: '/agents',
  },
  {
    icon: CheckSquare,
    label: '活动',
    description: '任务与日程',
    path: '/activities',
  },
  {
    icon: BookOpen,
    label: '知识库',
    description: '文档与数据',
    path: '/knowledge',
  },
  {
    icon: Clock,
    label: '定时任务',
    description: '自动化调度',
    path: '/scheduled-tasks',
  },
];

/* ─── Helpers ─── */

const MAX_ITEMS = 5;

function formatDueDate(dateStr: string): { text: string; urgent: boolean } {
  const due = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return { text: `逾期${Math.abs(diffDays)}天`, urgent: true };
  if (diffDays === 0) return { text: '今天', urgent: true };
  if (diffDays === 1) return { text: '明天', urgent: false };
  if (diffDays <= 7) return { text: `${diffDays}天后`, urgent: false };
  return { text: due.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }), urgent: false };
}

const PRIORITY_COLORS: Record<number, string> = {
  5: 'bg-red-500',
  4: 'bg-orange-500',
  3: 'bg-amber-500',
  2: 'bg-blue-500',
  1: 'bg-muted-foreground/40',
  0: 'bg-muted-foreground/40',
};

/* ─── Component ─── */

export function Home() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [unreadSessions, setUnreadSessions] = useState<Session[]>([]);
  const [focusActivities, setFocusActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [sessionsRes, activities] = await Promise.all([
          sessionApi.getSessions({ size: 100 }),
          activityApi.getFocusActivities(),
        ]);
        if (cancelled) return;
        setUnreadSessions(
          sessionsRes.items
            .filter((s) => s.unread_count > 0)
            .sort((a, b) => {
              const tA = a.last_activity_at ?? a.created_at;
              const tB = b.last_activity_at ?? b.created_at;
              return new Date(tB).getTime() - new Date(tA).getTime();
            }),
        );
        setFocusActivities(activities);
      } catch {
        // silently ignore – homepage is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const totalUnread = unreadSessions.reduce((sum, s) => sum + s.unread_count, 0);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8 max-w-4xl"
    >
      {/* Greeting */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Hi, {user?.username}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          欢迎回到 MetaHub
        </p>
      </motion.div>

      {/* Quick actions */}
      <motion.section variants={fadeUp} className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          快速开始
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.path}
                to={action.path}
                className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors duration-150 hover:bg-surface-hover cursor-pointer"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand transition-colors duration-150 group-hover:bg-brand/12">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {action.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </motion.section>

      {/* Pending overview */}
      <motion.section variants={fadeUp} className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          待处理
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Unread messages card */}
          <div className="rounded-xl border bg-card flex flex-col">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b">
              <MessageSquare className="h-4 w-4 text-brand" />
              <span className="text-sm font-medium">未读消息</span>
              {!loading && totalUnread > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-none text-brand-foreground">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="space-y-0 divide-y">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                  ))}
                </div>
              ) : unreadSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/60">
                  <CircleCheck className="h-8 w-8 mb-2" />
                  <span className="text-sm">暂无未读消息</span>
                </div>
              ) : (
                <div className="divide-y">
                  {unreadSessions.slice(0, MAX_ITEMS).map((session) => (
                    <div
                      key={session.id}
                      onClick={() => navigate(`/sessions/${session.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-150 hover:bg-surface-hover"
                    >
                      <span className="flex-1 min-w-0 text-sm truncate">
                        {session.name || '未命名会话'}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {formatRelativeTime(session.last_activity_at ?? session.created_at)}
                      </span>
                      <span className="inline-flex h-4.5 min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold leading-none text-brand-foreground">
                        {session.unread_count > 99 ? '99+' : session.unread_count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!loading && unreadSessions.length > 0 && (
              <Link
                to="/sessions"
                className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground hover:bg-surface-hover"
              >
                查看全部会话
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {/* Focus activities card */}
          <div className="rounded-xl border bg-card flex flex-col">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b">
              <Bell className="h-4 w-4 text-brand" />
              <span className="text-sm font-medium">待办提醒</span>
              {!loading && focusActivities.length > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-none text-brand-foreground">
                  {focusActivities.length > 99 ? '99+' : focusActivities.length}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="space-y-0 divide-y">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <Skeleton className="h-2.5 w-2.5 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              ) : focusActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/60">
                  <CircleCheck className="h-8 w-8 mb-2" />
                  <span className="text-sm">暂无待办事项</span>
                </div>
              ) : (
                <div className="divide-y">
                  {focusActivities.slice(0, MAX_ITEMS).map((activity) => {
                    const due = activity.due_date ? formatDueDate(activity.due_date) : null;
                    const priorityColor = PRIORITY_COLORS[activity.priority] ?? PRIORITY_COLORS[0];
                    return (
                      <div
                        key={activity.id}
                        onClick={() => navigate('/activities')}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-150 hover:bg-surface-hover"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${priorityColor}`} />
                        <span className="flex-1 min-w-0 text-sm truncate">
                          {activity.name}
                        </span>
                        {activity.status === 'active' && (
                          <span className="shrink-0 text-[10px] font-medium text-brand bg-brand/10 rounded px-1.5 py-0.5">
                            进行中
                          </span>
                        )}
                        {due && (
                          <span className={`shrink-0 text-[11px] tabular-nums ${due.urgent ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                            {due.text}
                          </span>
                        )}
                        {!due && activity.remind_at && (
                          <span className="shrink-0 flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            <AlertCircle className="h-3 w-3" />
                            {formatRelativeTime(activity.remind_at)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {!loading && focusActivities.length > 0 && (
              <Link
                to="/activities"
                className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground hover:bg-surface-hover"
              >
                查看全部活动
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
