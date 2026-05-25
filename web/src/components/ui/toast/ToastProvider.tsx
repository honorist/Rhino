import { useCallback, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ToastContext, type ToastKind } from './ToastContext';

/**
 * Provedor de toasts — delega para Sonner internamente.
 * A API pública (useToast + show) permanece inalterada para os consumers.
 * O <Toaster /> do Sonner está montado em main.tsx.
 */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    if (kind === 'success') toast.success(message);
    else if (kind === 'danger') toast.error(message);
    else if (kind === 'warning') toast.warning(message);
    else toast.info(message);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
