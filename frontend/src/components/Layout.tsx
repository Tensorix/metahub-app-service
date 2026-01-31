import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar, SIDEBAR_DEFAULT_WIDTH } from './Sidebar';
import { Button } from './ui/button';
import { useBreakpoints } from '@/hooks/useMediaQuery';

export function Layout() {
  const { isMobile } = useBreakpoints();
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
              className="mr-2"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">MetaHub</h1>
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="container mx-auto p-4 md:p-6 max-w-7xl flex-1 flex flex-col min-h-0">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
