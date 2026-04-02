import {
  Home,
  MessageSquare,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Bot,
  X,
  CheckSquare,
  BookOpen,
  Clock,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useAuthStore } from '../store/auth';
import { ThemeToggle } from './ThemeToggle';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { CardStyleContainer } from './ui/card-style-container';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from './ui/tooltip';

interface SidebarProps {
  className?: string;
  sidebarWidth: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  isResizing?: boolean;
}

/* ─── Navigation items ─── */

const NAV_MAIN = [
  { icon: Home, label: '首页', path: '/' },
  { icon: MessageSquare, label: '会话', path: '/sessions' },
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: CheckSquare, label: '活动', path: '/activities' },
  { icon: BookOpen, label: '知识库', path: '/knowledge' },
  { icon: Clock, label: '定时任务', path: '/scheduled-tasks' },
];

const NAV_FOOTER = [
  { icon: Settings, label: '设置', path: '/settings' },
];

/* ─── Constants ─── */

const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const COLLAPSED_WIDTH = 56;

export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = COLLAPSED_WIDTH;
export const SIDEBAR_MIN_WIDTH = MIN_WIDTH;
export const SIDEBAR_MAX_WIDTH = MAX_WIDTH;

/* ─── Component ─── */

export function Sidebar({
  className,
  sidebarWidth,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
  isResizing = false,
}: SidebarProps) {
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { isMobile } = useBreakpoints();

  const handleLogout = async () => {
    await logout();
  };

  const handleNavClick = () => {
    if (isMobile) onMobileOpenChange(false);
  };

  const currentWidth = collapsed ? COLLAPSED_WIDTH : sidebarWidth;
  const showFull = isMobile || !collapsed;

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(path + '/'));

  /* ─── Nav item renderer ─── */

  const renderNavItem = (item: (typeof NAV_MAIN)[number]) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    const link = (
      <Link key={item.path} to={item.path} onClick={handleNavClick}>
        <button
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            'transition-colors duration-150 cursor-pointer',
            active
              ? 'bg-brand-muted text-foreground'
              : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
            !showFull && 'justify-center px-0'
          )}
        >
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              active && 'text-brand'
            )}
          />
          {showFull && <span>{item.label}</span>}
        </button>
      </Link>
    );

    /* Tooltip when collapsed on desktop */
    if (!showFull) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  /* ─── Sidebar body ─── */

  const sidebarContent = (
    <aside
      className={cn(
        'flex h-full flex-col overflow-hidden',
        isResizing ? 'transition-none' : 'transition-[width] duration-200 ease-out',
        className
      )}
      style={{ width: isMobile ? '100%' : currentWidth }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b px-3',
          showFull ? 'justify-between' : 'justify-center'
        )}
      >
        {showFull && (
          <Link to="/" className="flex items-center gap-2.5" onClick={handleNavClick}>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
              <span className="text-xs font-bold">M</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">MetaHub</span>
          </Link>
        )}
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMobileOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? (
              <Menu className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {NAV_MAIN.map(renderNavItem)}
      </nav>

      {/* Footer section */}
      <div className="shrink-0 border-t px-2 py-2 space-y-0.5">
        {NAV_FOOTER.map(renderNavItem)}

        {/* User row */}
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2',
            !showFull && 'justify-center px-0'
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <span className="text-xs font-semibold">
              {user?.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          {showFull && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium leading-tight">
                {user?.username}
              </p>
              <p className="truncate text-xs text-muted-foreground leading-tight">
                {user?.email || '未设置邮箱'}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className={cn(
            'flex items-center',
            showFull ? 'justify-between px-2' : 'flex-col gap-1 justify-center'
          )}
        >
          <ThemeToggle />
          {showFull ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-8 gap-2 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                退出登录
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </aside>
  );

  /* ─── Mobile: drawer ─── */

  if (isMobile) {
    return (
      <TooltipProvider delayDuration={0}>
        {/* Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => onMobileOpenChange(false)}
          />
        )}
        {/* Drawer */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] border-r bg-card transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {sidebarContent}
        </div>
      </TooltipProvider>
    );
  }

  /* ─── Desktop: fixed sidebar + resize handle ─── */

  return (
    <TooltipProvider delayDuration={0}>
      <CardStyleContainer
        sides={['top','right', 'bottom']}
        size={8}
      >
        {/* 避免边缘有白线 */}
        <div className="relative flex h-full shrink-0 border-r bg-sidebar rounded-r-lg">
          {sidebarContent}
        </div>
      </CardStyleContainer>
    </TooltipProvider>
  );
}
