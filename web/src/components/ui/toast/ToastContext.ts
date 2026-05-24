import { createContext, useContext } from 'react';

export type ToastKind = 'success' | 'danger' | 'info' | 'warning';

export interface ToastContextValue {
  /** Exibe um toast efêmero. */
  show: (message: string, kind?: ToastKind) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Acessa o disparador de toasts. Requer <ToastProvider> acima na árvore. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast precisa estar dentro de <ToastProvider>');
  }
  return ctx;
}
