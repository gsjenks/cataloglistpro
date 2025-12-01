import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface FooterAction {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ai' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

interface FooterContextType {
  actions: FooterAction[];
  setActions: (actions: FooterAction[]) => void;
  clearActions: () => void;
  updateAction: (id: string, updates: Partial<FooterAction>) => void;
}

const FooterContext = createContext<FooterContextType | undefined>(undefined);

export function FooterProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<FooterAction[]>([]);

  const clearActions = useCallback(() => {
    setActions([]);
  }, []);

  const updateAction = useCallback((id: string, updates: Partial<FooterAction>) => {
    setActions(prev => 
      prev.map(action => 
        action.id === id ? { ...action, ...updates } : action
      )
    );
  }, []);

  return (
    <FooterContext.Provider
      value={{
        actions,
        setActions,
        clearActions,
        updateAction,
      }}
    >
      {children}
    </FooterContext.Provider>
  );
}

export function useFooter() {
  const context = useContext(FooterContext);
  if (context === undefined) {
    throw new Error('useFooter must be used within a FooterProvider');
  }
  return context;
}