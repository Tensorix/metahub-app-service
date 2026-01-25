import { useState, useEffect } from 'react';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

let toastCount = 0;
let memoryToasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

function notifyListeners() {
  listeners.forEach((listener) => listener(memoryToasts));
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryToasts);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  const toast = ({ title, description, variant = 'default' }: Omit<Toast, 'id'>) => {
    const id = `toast-${toastCount++}`;
    const newToast: Toast = { id, title, description, variant };
    
    memoryToasts = [...memoryToasts, newToast];
    notifyListeners();

    // 3秒后自动移除
    setTimeout(() => {
      memoryToasts = memoryToasts.filter((t) => t.id !== id);
      notifyListeners();
    }, 3000);
  };

  const dismiss = (id: string) => {
    memoryToasts = memoryToasts.filter((t) => t.id !== id);
    notifyListeners();
  };

  return { toast, toasts, dismiss };
}
