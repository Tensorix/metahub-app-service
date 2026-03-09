import { Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar, SIDEBAR_DEFAULT_WIDTH } from './Sidebar';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { PageTitleProvider, usePageTitle } from '@/contexts/PageTitleContext';

function LayoutContent() {
  const { isMobile } = useBreakpoints();
  const { title, actions } = usePageTitle();
  const location = useLocation();
  const isKnowledge = location.pathname.includes('/knowledge');
  const isAgents = location.pathname.includes('/agents');
  const isActivities = location.pathname.includes('/activities');
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        sidebarWidth={sidebarWidth}
        onWidthChange={setSidebarWidth}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileOpenChange={setMobileMenuOpen}
      />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* 移动端顶部导航栏 */}
        {isMobile && (
          <div className="flex h-14 items-center border-b px-4 shrink-0 bg-background">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="mr-2 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold truncate flex-1 min-w-0">
              {title || 'MetaHub'}
            </h1>
            {/* 顶栏操作按钮 */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 ml-2 shrink-0">
                {actions.map((action) => (
                  <Button
                    key={action.key}
                    variant={action.variant || 'default'}
                    size="sm"
                    onClick={action.onClick}
                    className="gap-1.5"
                  >
                    {action.icon}
                    <span className="hidden sm:inline">{action.label}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div
            className={cn(
              'flex-1 flex flex-col min-h-0',
              isKnowledge || isAgents || isActivities
                ? 'p-0 w-full'
                : 'container mx-auto p-4 md:p-6 max-w-7xl'
            )}
          >
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export function Layout() {
  return (
    <PageTitleProvider>
      <LayoutContent />
    </PageTitleProvider>
  );
}
