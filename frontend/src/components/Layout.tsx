import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import {
  Sidebar,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './Sidebar';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import { PageTitleProvider, usePageTitle } from '@/contexts/PageTitleContext';
import { ResizableHandle } from './ui/resizable';

/* ─── Full-bleed pages (no container padding) ─── */
const FULL_BLEED_PATHS = ['/knowledge', '/agents', '/activities', '/sessions'];

function LayoutContent() {
  const { isMobile } = useBreakpoints();
  const { title, actions, hideTopBar, registerOpenSidebar } = usePageTitle();
  const location = useLocation();

  const isFullBleed = FULL_BLEED_PATHS.some((p) =>
    location.pathname === p || location.pathname.startsWith(p + '/')
  );

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) =>
      Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, prev + delta))
    );
  }, []);

  useEffect(() => {
    registerOpenSidebar(() => setMobileMenuOpen(true));
  }, [registerOpenSidebar]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        sidebarWidth={sidebarWidth}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileOpenChange={setMobileMenuOpen}
        isResizing={isSidebarResizing}
      />

      {!isMobile && !sidebarCollapsed && (
        <ResizableHandle
          direction="horizontal"
          onResize={handleSidebarResize}
          onDragStart={() => setIsSidebarResizing(true)}
          onDragEnd={() => setIsSidebarResizing(false)}
          className="bg-[#ebebeb]"
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar — hidden when child page takes control */}
        {isMobile && !hideTopBar && (
          <div className="flex h-13 items-center gap-3 border-b px-4 shrink-0 bg-background">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileMenuOpen(true)}
              className="shrink-0"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold truncate flex-1 min-w-0">
              {title || 'MetaHub'}
            </h1>
            {actions.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Page content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
          <div
            className={cn(
              'flex-1 flex flex-col min-h-0',
              isFullBleed
                ? 'p-0 w-full'
                : 'container mx-auto px-4 py-6 md:px-6 lg:px-8 max-w-7xl'
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
