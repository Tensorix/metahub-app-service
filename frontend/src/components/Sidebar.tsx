import { Home, MessageSquare, Settings, LogOut, ChevronLeft, Menu, Bot, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useAuthStore } from '../store/auth';
import { ThemeToggle } from './ThemeToggle';
import { useCallback } from 'react';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { ResizableHandle } from './ui/resizable';

interface SidebarProps {
  className?: string;
  sidebarWidth: number;
  onWidthChange: (width: number) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

const menuItems = [
  { icon: Home, label: '首页', path: '/' },
  { icon: MessageSquare, label: '会话', path: '/sessions' },
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: Settings, label: '设置', path: '/settings' },
];

const MIN_WIDTH = 180;
const MAX_WIDTH = 320;
const COLLAPSED_WIDTH = 64;

export function Sidebar({
  className,
  sidebarWidth,
  onWidthChange,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { isMobile } = useBreakpoints();

  const handleLogout = async () => {
    await logout();
  };

  const handleResize = useCallback(
    (delta: number) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, sidebarWidth + delta));
      onWidthChange(newWidth);
    },
    [sidebarWidth, onWidthChange]
  );

  const handleNavClick = () => {
    // 移动端点击导航项后关闭侧边栏
    if (isMobile) {
      onMobileOpenChange(false);
    }
  };

  const currentWidth = collapsed ? COLLAPSED_WIDTH : sidebarWidth;

  // 移动端始终显示完整内容
  const showFullContent = isMobile || !collapsed;

  // 侧边栏内容
  const sidebarContent = (
    <aside
      className={cn(
        'flex h-full flex-col bg-card transition-all duration-300 ease-in-out overflow-hidden',
        className
      )}
      style={{ width: isMobile ? '100%' : currentWidth }}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {showFullContent && (
          <h2 className="text-lg font-semibold">MetaHub</h2>
        )}
        <div className="flex items-center gap-1">
          {isMobile ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onMobileOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCollapsedChange(!collapsed)}
              className="h-8 w-8"
            >
              {collapsed ? (
                <Menu className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* User Info */}
      <div className="border-b p-4">
        <div className={cn(
          'flex items-center gap-3',
          !showFullContent && 'justify-center'
        )}>
          {/* 修复头像被压扁问题：使用 shrink-0 和 aspect-square */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground aspect-square">
            <span className="text-sm font-medium">
              {user?.username.charAt(0).toUpperCase()}
            </span>
          </div>
          {showFullContent && (
            <div className="flex-1 overflow-hidden min-w-0">
              <p className="truncate text-sm font-medium">{user?.username}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email || '未设置邮箱'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link key={item.path} to={item.path} onClick={handleNavClick}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  !showFullContent && 'justify-center px-2'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', showFullContent && 'mr-2')} />
                {showFullContent && <span>{item.label}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-1">
        <div className={cn('flex', !showFullContent ? 'justify-center' : 'justify-end px-2')}>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full justify-start text-destructive hover:text-destructive',
            !showFullContent && 'justify-center px-2'
          )}
        >
          <LogOut className={cn('h-4 w-4 shrink-0', showFullContent && 'mr-2')} />
          {showFullContent && <span>退出登录</span>}
        </Button>
      </div>
    </aside>
  );

  // 移动端：抽屉式侧边栏
  if (isMobile) {
    return (
      <>
        {/* 遮罩层 */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => onMobileOpenChange(false)}
          />
        )}
        {/* 侧边栏抽屉 */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] border-r bg-card transition-transform duration-300 ease-in-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  // 桌面端：固定侧边栏 + 拖拽调整
  return (
    <div className="relative flex h-full shrink-0 border-r">
      {sidebarContent}
      {!collapsed && (
        <ResizableHandle
          direction="horizontal"
          onResize={handleResize}
          className="-mr-1"
        />
      )}
    </div>
  );
}

// 导出侧边栏默认宽度常量
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = COLLAPSED_WIDTH;
export const SIDEBAR_MIN_WIDTH = MIN_WIDTH;
export const SIDEBAR_MAX_WIDTH = MAX_WIDTH;
