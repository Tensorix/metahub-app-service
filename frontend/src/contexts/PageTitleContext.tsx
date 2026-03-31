import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export interface TopBarAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
}

interface PageTitleContextValue {
  title: string | null;
  setTitle: (title: string | null) => void;
  actions: TopBarAction[];
  setActions: (actions: TopBarAction[]) => void;
  hideTopBar: boolean;
  setHideTopBar: (hide: boolean) => void;
  openSidebar: () => void;
  registerOpenSidebar: (fn: () => void) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState<string | null>(null);
  const [actions, setActionsState] = useState<TopBarAction[]>([]);
  const [hideTopBar, setHideTopBarState] = useState(false);
  const openSidebarRef = useRef<() => void>(() => {});

  const setTitle = useCallback((t: string | null) => setTitleState(t), []);
  const setActions = useCallback((a: TopBarAction[]) => setActionsState(a), []);
  const setHideTopBar = useCallback((h: boolean) => setHideTopBarState(h), []);
  const registerOpenSidebar = useCallback((fn: () => void) => { openSidebarRef.current = fn; }, []);
  const openSidebar = useCallback(() => openSidebarRef.current(), []);

  return (
    <PageTitleContext.Provider value={{
      title, setTitle,
      actions, setActions,
      hideTopBar, setHideTopBar,
      openSidebar, registerOpenSidebar,
    }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  const ctx = useContext(PageTitleContext);
  return ctx ?? {
    title: null, setTitle: () => {},
    actions: [], setActions: () => {},
    hideTopBar: false, setHideTopBar: () => {},
    openSidebar: () => {}, registerOpenSidebar: () => {},
  };
}
