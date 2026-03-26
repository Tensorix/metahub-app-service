import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  MessageSquare,
  Bot,
  CheckSquare,
  BookOpen,
  Clock,
  ArrowRight,
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';

/* ─── Stagger animation variants ─── */

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

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

/* ─── Component ─── */

export function Home() {
  const { user } = useAuthStore();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="space-y-8 max-w-4xl"
    >
      {/* Greeting */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Hi, {user?.username}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          欢迎回到 MetaHub
        </p>
      </motion.div>

      {/* Quick actions */}
      <motion.section variants={item} className="space-y-3">
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

      {/* Account info */}
      <motion.section variants={item} className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          账户信息
        </h2>
        <div className="rounded-xl border bg-card divide-y">
          <InfoRow icon={User} label="用户名" value={user?.username} />
          <InfoRow icon={Mail} label="邮箱" value={user?.email || '未设置'} muted={!user?.email} />
          <InfoRow icon={Phone} label="手机号" value={user?.phone || '未设置'} muted={!user?.phone} />
          <InfoRow
            icon={Shield}
            label="角色"
            value={user?.is_superuser ? '管理员' : '普通用户'}
          />
          <InfoRow
            icon={Calendar}
            label="注册时间"
            value={
              user?.created_at
                ? new Date(user.created_at).toLocaleDateString('zh-CN')
                : '-'
            }
          />
        </div>
      </motion.section>
    </motion.div>
  );
}

/* ─── Info row sub-component ─── */

function InfoRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof User;
  label: string;
  value?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      <span className="text-sm text-muted-foreground w-20 shrink-0">{label}</span>
      <span
        className={
          muted
            ? 'text-sm text-muted-foreground/50'
            : 'text-sm font-medium'
        }
      >
        {value}
      </span>
    </div>
  );
}
