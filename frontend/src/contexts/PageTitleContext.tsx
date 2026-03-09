import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState<string | null>(null);
  const [actions, setActionsState] = useState<TopBarAction[]>([]);
  
  const setTitle = useCallback((t: string | null) => setTitleState(t), []);
  const setActions = useCallback((a: TopBarAction[]) => setActionsState(a), []);
  
  return (
    <PageTitleContext.Provider value={{ title, setTitle, actions, setActions }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  const ctx = useContext(PageTitleContext);
  return ctx ?? { title: null, setTitle: () => {}, actions: [], setActions: () => {} };
}
